import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Radio,
  DatePicker,
  Table,
  Spin,
  Button,
  message,
} from "antd";
import { SyncOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchUsage, type UsageRowDTO } from "../services/api";
import dayjs, { type Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

const COLORS = [
  "#1677ff", "#52c41a", "#faad14", "#ff4d4f", "#722ed1",
  "#13c2c2", "#eb2f96", "#fa8c16", "#2f54eb", "#a0d911",
];

const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const CHART_HEIGHT = 160;

type GroupBy = "app" | "model";
type Period = "day" | "week" | "month";

/** Matches SQLite strftime('%Y-W%W') (week starts Sunday). */
function sqliteWeekKey(d: Dayjs): string {
  const year = d.year();
  const yday = d.diff(dayjs(`${year}-01-01`), "day");
  const jan1Wday = dayjs(`${year}-01-01`).day();
  const week = Math.floor((yday + jan1Wday) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function buildPeriodKeys(
  start: Dayjs,
  end: Dayjs,
  period: Period
): string[] {
  const from = start.startOf("day");
  const to = end.startOf("day");
  if (from.isAfter(to)) return [];

  if (period === "day") {
    const keys: string[] = [];
    let cur = from;
    while (!cur.isAfter(to)) {
      keys.push(cur.format("YYYY-MM-DD"));
      cur = cur.add(1, "day");
    }
    return keys;
  }

  if (period === "month") {
    const keys: string[] = [];
    let cur = from.startOf("month");
    const last = to.startOf("month");
    while (!cur.isAfter(last)) {
      keys.push(cur.format("YYYY-MM"));
      cur = cur.add(1, "month");
    }
    return keys;
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  let cur = from;
  while (!cur.isAfter(to)) {
    const key = sqliteWeekKey(cur);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cur = cur.add(1, "day");
  }
  return keys;
}

function formatChartDate(dateKey: string, period: Period): string {
  if (period === "month") {
    const [, m] = dateKey.split("-");
    return `${Number(m)}月`;
  }
  if (period === "week") {
    return dateKey.replace(/^\d{4}-/, "");
  }
  const d = dayjs(dateKey);
  return d.isValid() ? d.format("M-D") : dateKey;
}

type UsageBarChartProps = {
  data: Record<string, unknown>[];
  dimensions: string[];
  valueKey: "requests" | "total";
  stackId: string;
  period: Period;
};

function UsageBarChart({
  data,
  dimensions,
  valueKey,
  stackId,
  period,
}: UsageBarChartProps) {
  const xTicks =
    data.length <= 1
      ? data.map((d) => d.date as string)
      : [data[0]!.date as string, data[data.length - 1]!.date as string];

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart
        data={data}
        barCategoryGap="58%"
        margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
      >
        <CartesianGrid vertical={false} stroke="#eee" strokeDasharray="" />
        <XAxis
          dataKey="date"
          ticks={xTicks}
          tickLine={false}
          axisLine={{ stroke: "#e8e8e8" }}
          tick={{ fill: "#999", fontSize: 12 }}
          tickFormatter={(v) => formatChartDate(String(v), period)}
          dy={6}
        />
        <YAxis hide allowDecimals={false} tickCount={2} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          }}
          labelFormatter={(v) => formatChartDate(String(v), period)}
        />
        {dimensions.length > 1 && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
          />
        )}
        {dimensions.map((dim, i) => (
          <Bar
            key={dim}
            dataKey={`${dim}_${valueKey}`}
            name={dim}
            fill={COLORS[i % COLORS.length]}
            stackId={stackId}
            maxBarSize={7}
            radius={
              i === dimensions.length - 1 ? BAR_RADIUS : [0, 0, 0, 0]
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Usage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("model");
  const [period, setPeriod] = useState<Period>("day");
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, "day"),
    dayjs(),
  ]);
  const [rows, setRows] = useState<UsageRowDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsage({
        groupBy,
        period,
        start: range[0].format("YYYY-MM-DD"),
        end: range[1].add(1, "day").format("YYYY-MM-DD"),
      });
      setRows(data);
    } catch {
      message.error("Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, [groupBy, period, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const dimensions = useMemo(
    () => [...new Set(rows.map((r) => r.dimensionName))],
    [rows]
  );

  const chartData = useMemo(() => {
    const periodKeys = buildPeriodKeys(range[0], range[1], period);
    const dateMap = new Map<string, Record<string, unknown>>();

    for (const dateKey of periodKeys) {
      const entry: Record<string, unknown> = { date: dateKey };
      for (const dim of dimensions) {
        entry[`${dim}_requests`] = 0;
        entry[`${dim}_prompt`] = 0;
        entry[`${dim}_completion`] = 0;
        entry[`${dim}_total`] = 0;
      }
      dateMap.set(dateKey, entry);
    }

    for (const r of rows) {
      const entry = dateMap.get(r.dateKey);
      if (!entry) continue;
      entry[`${r.dimensionName}_requests`] = r.requests;
      entry[`${r.dimensionName}_prompt`] = r.promptTokens;
      entry[`${r.dimensionName}_completion`] = r.completionTokens;
      entry[`${r.dimensionName}_total`] =
        r.promptTokens + r.completionTokens;
    }

    return periodKeys.map((k) => dateMap.get(k)!);
  }, [rows, range, period, dimensions]);

  const summaryData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; requests: number; prompt: number; completion: number }
    >();
    for (const r of rows) {
      const existing = map.get(r.dimensionName) ?? {
        name: r.dimensionName,
        requests: 0,
        prompt: 0,
        completion: 0,
      };
      existing.requests += r.requests;
      existing.prompt += r.promptTokens;
      existing.completion += r.completionTokens;
      map.set(r.dimensionName, existing);
    }
    return [...map.values()].sort((a, b) => b.requests - a.requests);
  }, [rows]);

  const summaryColumns = [
    {
      title: groupBy === "app" ? "App" : "Model",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: "Calls",
      dataIndex: "requests",
      key: "requests",
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.requests - b.requests,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Prompt Tokens",
      dataIndex: "prompt",
      key: "prompt",
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.prompt - b.prompt,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Completion Tokens",
      dataIndex: "completion",
      key: "completion",
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.completion - b.completion,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Total Tokens",
      key: "total",
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.prompt + a.completion - (b.prompt + b.completion),
      render: (_: unknown, r: (typeof summaryData)[0]) =>
        (r.prompt + r.completion).toLocaleString(),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Usage Analytics
        </Typography.Title>
        <Radio.Group
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
          options={[
            { label: "By Model", value: "model" },
            { label: "By App", value: "app" },
          ]}
        />
        <Radio.Group
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          optionType="button"
          size="small"
          options={[
            { label: "Day", value: "day" },
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
          ]}
        />
        <RangePicker
          size="small"
          value={range}
          onChange={(v) => {
            if (v?.[0] && v?.[1]) setRange([v[0], v[1]]);
          }}
        />
        <Button
          icon={<SyncOutlined spin={loading} />}
          onClick={() => void load()}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Typography.Title level={5}>Calls</Typography.Title>
          <UsageBarChart
            data={chartData}
            dimensions={dimensions}
            valueKey="requests"
            stackId="calls"
            period={period}
          />

          <Typography.Title level={5} style={{ marginTop: 32 }}>
            Token Usage
          </Typography.Title>
          <UsageBarChart
            data={chartData}
            dimensions={dimensions}
            valueKey="total"
            stackId="tokens"
            period={period}
          />

          <Typography.Title level={5} style={{ marginTop: 32 }}>
            Summary
          </Typography.Title>
          <Table
            dataSource={summaryData}
            columns={summaryColumns}
            rowKey="name"
            size="small"
            pagination={false}
          />
        </>
      )}
    </div>
  );
}
