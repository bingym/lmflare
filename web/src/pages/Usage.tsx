import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Radio,
  DatePicker,
  Space,
  Table,
  Spin,
  message,
} from "antd";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

type GroupBy = "app" | "model";
type Period = "day" | "week" | "month";

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
      message.error("加载用量数据失败");
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
    const dateMap = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      if (!dateMap.has(r.dateKey)) dateMap.set(r.dateKey, { date: r.dateKey });
      const entry = dateMap.get(r.dateKey)!;
      entry[`${r.dimensionName}_requests`] = r.requests;
      entry[`${r.dimensionName}_prompt`] = r.promptTokens;
      entry[`${r.dimensionName}_completion`] = r.completionTokens;
      entry[`${r.dimensionName}_total`] = r.promptTokens + r.completionTokens;
    }
    return [...dateMap.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );
  }, [rows]);

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
      title: groupBy === "app" ? "App" : "模型",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: "调用次数",
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
      title: "总 Tokens",
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
          Usage
        </Typography.Title>
        <Radio.Group
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
          options={[
            { label: "按模型", value: "model" },
            { label: "按 App", value: "app" },
          ]}
        />
        <Radio.Group
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          optionType="button"
          size="small"
          options={[
            { label: "日", value: "day" },
            { label: "周", value: "week" },
            { label: "月", value: "month" },
          ]}
        />
        <RangePicker
          size="small"
          value={range}
          onChange={(v) => {
            if (v?.[0] && v?.[1]) setRange([v[0], v[1]]);
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Typography.Title level={5}>调用次数</Typography.Title>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              {dimensions.map((dim, i) => (
                <Line
                  key={dim}
                  type="monotone"
                  dataKey={`${dim}_requests`}
                  name={dim}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <Typography.Title level={5} style={{ marginTop: 32 }}>
            Token 用量
          </Typography.Title>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              {dimensions.map((dim, i) => (
                <Area
                  key={dim}
                  type="monotone"
                  dataKey={`${dim}_total`}
                  name={dim}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls
                  stackId="tokens"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>

          <Typography.Title level={5} style={{ marginTop: 32 }}>
            汇总
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
