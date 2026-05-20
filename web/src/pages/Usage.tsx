import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Radio,
  DatePicker,
  Table,
  Spin,
  Button,
  message,
  Card,
  Statistic,
  Row,
  Col,
} from "antd";
import SyncOutlined from "@ant-design/icons/es/icons/SyncOutlined";
import ThunderboltOutlined from "@ant-design/icons/es/icons/ThunderboltOutlined";
import MessageOutlined from "@ant-design/icons/es/icons/MessageOutlined";
import CodeOutlined from "@ant-design/icons/es/icons/CodeOutlined";
import FileTextOutlined from "@ant-design/icons/es/icons/FileTextOutlined";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fetchUsage, type UsageRowDTO } from "../services/api";
import dayjs, { type Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

const PALETTE = [
  { stroke: "#4f46e5", fill: "#4f46e5" },
  { stroke: "#0ea5e9", fill: "#0ea5e9" },
  { stroke: "#10b981", fill: "#10b981" },
  { stroke: "#f59e0b", fill: "#f59e0b" },
  { stroke: "#ef4444", fill: "#ef4444" },
  { stroke: "#8b5cf6", fill: "#8b5cf6" },
  { stroke: "#ec4899", fill: "#ec4899" },
  { stroke: "#14b8a6", fill: "#14b8a6" },
  { stroke: "#f97316", fill: "#f97316" },
  { stroke: "#06b6d4", fill: "#06b6d4" },
];

type GroupBy = "app" | "model";
type Period = "day" | "week" | "month";

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
    const [y, m] = dateKey.split("-");
    return `${y}/${m}`;
  }
  if (period === "week") {
    return dateKey.replace(/^\d{4}-/, "");
  }
  const d = dayjs(dateKey);
  return d.isValid() ? d.format("M/D") : dateKey;
}

function formatNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

type ChartConfig = {
  data: Record<string, unknown>[];
  dimensions: string[];
  valueKey: string;
  period: Period;
  title: string;
  height?: number;
};

function UsageAreaChart({ data, dimensions, valueKey, period, title, height = 260 }: ChartConfig) {
  return (
    <Card
      size="small"
      style={{ border: "1px solid #f0f0f0" }}
      styles={{ body: { padding: "16px 16px 8px" } }}
    >
      <Typography.Text strong style={{ fontSize: 14 }}>
        {title}
      </Typography.Text>
      <div style={{ marginTop: 12 }}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
          >
            <defs>
              {dimensions.map((dim, i) => (
                <linearGradient key={dim} id={`grad_${valueKey}_${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[i % PALETTE.length].fill} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={PALETTE[i % PALETTE.length].fill} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#f0f0f0"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "#e8e8e8" }}
              tick={{ fill: "#999", fontSize: 11 }}
              tickFormatter={(v) => formatChartDate(String(v), period)}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#999", fontSize: 11 }}
              tickFormatter={(v) => formatNumber(v as number)}
              width={50}
            />
            <ReTooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e8e8e8",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
                padding: "10px 14px",
                fontSize: 13,
              }}
              labelFormatter={(v) => formatChartDate(String(v), period)}
              formatter={(value, name) => {
                const num = typeof value === "number" ? value : Number(value ?? 0);
                const label = String(name ?? "").replace(new RegExp(`_${valueKey}$`), "");
                return [num.toLocaleString(), label];
              }}
            />
            {dimensions.length > 1 && (
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
                formatter={(value) => value.replace(new RegExp(`_${valueKey}$`), "")}
              />
            )}
            {dimensions.map((dim, i) => (
              <Area
                key={dim}
                type="monotone"
                dataKey={`${dim}_${valueKey}`}
                name={`${dim}_${valueKey}`}
                stroke={PALETTE[i % PALETTE.length].stroke}
                fill={`url(#grad_${valueKey}_${i})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                stackId={dimensions.length > 1 ? "stack" : undefined}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
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

  const totals = useMemo(() => {
    return summaryData.reduce(
      (acc, r) => ({
        requests: acc.requests + r.requests,
        prompt: acc.prompt + r.prompt,
        completion: acc.completion + r.completion,
      }),
      { requests: 0, prompt: 0, completion: 0 }
    );
  }, [summaryData]);

  const summaryColumns = [
    {
      title: groupBy === "app" ? "App" : "Model",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      render: (v: string) => (
        <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "请求次数",
      dataIndex: "requests",
      key: "requests",
      align: "right" as const,
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.requests - b.requests,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Prompt Tokens",
      dataIndex: "prompt",
      key: "prompt",
      align: "right" as const,
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.prompt - b.prompt,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Completion Tokens",
      dataIndex: "completion",
      key: "completion",
      align: "right" as const,
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.completion - b.completion,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Total Tokens",
      key: "total",
      align: "right" as const,
      sorter: (a: (typeof summaryData)[0], b: (typeof summaryData)[0]) =>
        a.prompt + a.completion - (b.prompt + b.completion),
      render: (_: unknown, r: (typeof summaryData)[0]) =>
        (r.prompt + r.completion).toLocaleString(),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Usage Analytics
        </Typography.Title>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Radio.Group
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
            options={[
              { label: "按模型", value: "model" },
              { label: "按应用", value: "app" },
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
          <Button
            icon={<SyncOutlined spin={loading} />}
            onClick={() => void load()}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ border: "1px solid #f0f0f0" }}>
                <Statistic
                  title={<span style={{ fontSize: 12, color: "#999" }}>总请求数</span>}
                  value={totals.requests}
                  prefix={<ThunderboltOutlined style={{ color: "#4f46e5", fontSize: 16 }} />}
                  valueStyle={{ fontSize: 22, fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ border: "1px solid #f0f0f0" }}>
                <Statistic
                  title={<span style={{ fontSize: 12, color: "#999" }}>Prompt Tokens</span>}
                  value={totals.prompt}
                  prefix={<MessageOutlined style={{ color: "#0ea5e9", fontSize: 16 }} />}
                  valueStyle={{ fontSize: 22, fontWeight: 600 }}
                  formatter={(v) => formatNumber(v as number)}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ border: "1px solid #f0f0f0" }}>
                <Statistic
                  title={<span style={{ fontSize: 12, color: "#999" }}>Completion Tokens</span>}
                  value={totals.completion}
                  prefix={<CodeOutlined style={{ color: "#10b981", fontSize: 16 }} />}
                  valueStyle={{ fontSize: 22, fontWeight: 600 }}
                  formatter={(v) => formatNumber(v as number)}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ border: "1px solid #f0f0f0" }}>
                <Statistic
                  title={<span style={{ fontSize: 12, color: "#999" }}>Total Tokens</span>}
                  value={totals.prompt + totals.completion}
                  prefix={<FileTextOutlined style={{ color: "#f59e0b", fontSize: 16 }} />}
                  valueStyle={{ fontSize: 22, fontWeight: 600 }}
                  formatter={(v) => formatNumber(v as number)}
                />
              </Card>
            </Col>
          </Row>

          {/* Charts */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} lg={12}>
              <UsageAreaChart
                data={chartData}
                dimensions={dimensions}
                valueKey="requests"
                period={period}
                title="请求趋势"
              />
            </Col>
            <Col xs={24} lg={12}>
              <UsageAreaChart
                data={chartData}
                dimensions={dimensions}
                valueKey="total"
                period={period}
                title="Token 用量趋势"
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} lg={12}>
              <UsageAreaChart
                data={chartData}
                dimensions={dimensions}
                valueKey="prompt"
                period={period}
                title="Prompt Tokens 趋势"
              />
            </Col>
            <Col xs={24} lg={12}>
              <UsageAreaChart
                data={chartData}
                dimensions={dimensions}
                valueKey="completion"
                period={period}
                title="Completion Tokens 趋势"
              />
            </Col>
          </Row>

          {/* Detail Table */}
          <Card
            size="small"
            style={{ border: "1px solid #f0f0f0" }}
            styles={{ body: { padding: 0 } }}
          >
            <div style={{ padding: "14px 16px 0" }}>
              <Typography.Text strong style={{ fontSize: 14 }}>
                明细汇总
              </Typography.Text>
            </div>
            <Table
              dataSource={summaryData}
              columns={summaryColumns}
              rowKey="name"
              size="small"
              pagination={false}
              style={{ marginTop: 4 }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
