import { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import './App.css';

dayjs.extend(isoWeek);

// ===============================
// Types
// ===============================
interface DataRecord {
  date?: string; week?: string; month?: string; period?: number;
  load: number | null; interconnect: number | null;
  wind: number | null; solar: number | null; hydro: number | null;
  renewables: number | null; generation: number | null;
  price_dayahead: number | null; price_realtime: number | null;
  wind_speed?: number | null; solar_radiation?: number | null;
  bidding_space?: number | null;
  [key: string]: any;
}
interface DataPayload {
  hourly: DataRecord[]; daily: DataRecord[]; weekly: DataRecord[]; monthly: DataRecord[]; rolling?: any[];
  meta: { total_hourly_records: number; date_range: { start: string; end: string }; generated_at: string; total_daily_records: number; total_weekly_records: number; total_monthly_records: number; };
}
type TimeScale = 'hourly' | 'daily' | 'weekly' | 'monthly';
type PageId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'page6' | 'page7' | 'page8';

// 日前节点信息 (congestion analysis)
interface NodeRecord {
  date: string; period: number; node: string;
  node_price: number | null; energy_price: number | null; congestion_price: number | null;
}
interface NodePayload { nodes: string[]; hourly: NodeRecord[]; }

// ===============================
// Constants
// ===============================
const METRICS: { [k: string]: { label: string; color: string; unit: string } } = {
  load:             { label: '系统负荷', color: '#f23645', unit: 'MW' },
  interconnect:     { label: '联络线',   color: '#787b86', unit: 'MW' },
  wind:             { label: '风电出力', color: '#089981', unit: 'MW' },
  solar:            { label: '光伏出力', color: '#f59e0b', unit: 'MW' },
  hydro:            { label: '水电出力', color: '#2962ff', unit: 'MW' },
  renewables:       { label: '新能源合计', color: '#00bcd4', unit: 'MW' },
  price_dayahead:   { label: '日前价格', color: '#e040fb', unit: '元/MWh' },
  price_realtime:   { label: '实时价格', color: '#ff6d00', unit: '元/MWh' },
  wind_speed:       { label: '风速', color: '#26a69a', unit: 'm/s' },
  solar_radiation:  { label: '地表短波辐射', color: '#ff9800', unit: 'W/m²' },
  bidding_space:    { label: '竞价空间', color: '#1e40af', unit: 'MW' },
};

// Page 2: two-day weather comparison config
// outKey/outLabel/outColor: output/load series overlaid as bars on a second y-axis
const WEATHER_COMPARE_ITEMS = [
  { key: 'wind_speed',      label: '风速',     unit: 'm/s',  color: '#26a69a', outKey: 'wind',  outLabel: '风电出力', outColor: '#089981' },
  { key: 'solar_radiation', label: '短波辐射', unit: 'W/m²', color: '#ff9800', outKey: 'solar', outLabel: '光伏出力', outColor: '#f59e0b' },
  { key: 'temperature',     label: '温度',     unit: '°C',   color: '#f23645', outKey: 'load',  outLabel: '系统负荷', outColor: '#6366f1' },
  { key: 'rainfall',        label: '降水',     unit: 'mm',   color: '#2962ff', outKey: 'hydro', outLabel: '水电出力', outColor: '#0ea5e9' },
];

// Page 2: Hedong (河东) weather comparison config — only wind/radiation available
const HEDONG_COMPARE_ITEMS = [
  { key: 'hedong_wind_speed',      label: '风速 (河东)',     unit: 'm/s',  color: '#0d9488', outKey: 'wind',  outLabel: '风电出力', outColor: '#089981' },
  { key: 'hedong_solar_radiation', label: '短波辐射 (河东)', unit: 'W/m²', color: '#ea580c', outKey: 'solar', outLabel: '光伏出力', outColor: '#f59e0b' },
];

// Hedong tab: standalone load card (no weather line, A/B load lines only)
const HEDONG_LOAD_ITEM = { key: 'load', label: '系统负荷', unit: 'MW', color: '#6366f1' };

// 两日对比 tab: standalone interconnect card (A/B lines only, fills row 4 right half)
const INTERCONNECT_ITEM = { key: 'interconnect', label: '联络线', unit: 'MW', color: '#8b5cf6' };

// 两日对比 tab: standalone bidding-space card (A/B lines only)
const BIDDING_SPACE_ITEM = { key: 'bidding_space', label: '竞价空间', unit: 'MW', color: '#1e40af' };

// Page 2: time-series / scatter metric config keyed by weatherMetric
const WEATHER_TS_CFG: { [k: string]: { ts: [string, string, string, string, string]; scatter: [string, string, string, string, string] } } = {
  wind:  { ts: ['wind_speed', 'wind', '风速', '风电出力', '#089981'], scatter: ['wind_speed', 'wind', '风速 (m/s)', '风电出力 (MW)', '#089981'] },
  solar: { ts: ['solar_radiation', 'solar', '辐射', '光伏出力', '#f59e0b'], scatter: ['solar_radiation', 'solar', '短波辐射 (W/m²)', '光伏出力 (MW)', '#f59e0b'] },
  load:  { ts: ['temperature', 'load', '温度', '系统负荷', '#f23645'], scatter: ['temperature', 'load', '温度 (°C)', '系统负荷 (MW)', '#f23645'] },
  hydro: { ts: ['rainfall', 'hydro', '降水', '水电出力', '#2962ff'], scatter: ['rainfall', 'hydro', '降水 (mm)', '水电出力 (MW)', '#2962ff'] },
};

const HOUR_COLORS_24 = [
  '#2563eb', // 01:00 宝蓝
  '#0284c7', // 02:00 浅蓝
  '#089981', // 03:00 青绿
  '#10b981', // 04:00 翡翠绿
  '#22c55e', // 05:00 鲜绿
  '#84cc16', // 06:00 黄绿
  '#eab308', // 07:00 金黄
  '#f59e0b', // 08:00 暖黄
  '#f97316', // 09:00 橙色
  '#ef4444', // 10:00 红色
  '#dc2626', // 11:00 深红
  '#e11d48', // 12:00 玫瑰红
  '#ec4899', // 13:00 粉红
  '#d946ef', // 14:00 品红
  '#c026d3', // 15:00 紫红
  '#a855f7', // 16:00 亮紫
  '#8b5cf6', // 17:00 紫罗兰
  '#6366f1', // 18:00 靛蓝
  '#4338ca', // 19:00 深靛蓝
  '#1e40af', // 20:00 藏青
  '#0f766e', // 21:00 深青
  '#15803d', // 22:00 深绿
  '#b45309', // 23:00 棕褐
  '#475569', // 24:00 蓝灰
];

const TIME_BTNS: { key: TimeScale; label: string }[] = [
  { key: 'hourly', label: '24时段' },
  { key: 'daily', label: '日均值' },
  { key: 'weekly', label: '周均值' },
  { key: 'monthly', label: '月均值' },
];

const PAGE_BTNS: { key: PageId; label: string }[] = [
  { key: 'page1', label: '历史总览' },
  { key: 'page2', label: '气象相关性' },
  { key: 'page3', label: '竞价空间' },
  { key: 'page4', label: '现货价格对比' },
  { key: 'page5', label: '日前结算价差' },
  { key: 'page6', label: '日滚动交易机会' },
  { key: 'page7', label: '策略：价差套利' },
  { key: 'page8', label: '阻塞分析' },
];

// ===============================
// Helpers
// ===============================
// Isolated ticking clock — keeps the 1s re-render scoped to this tiny
// component so chart tooltips are not dismissed by App-level re-renders.
const Clock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }) + ' (UTC+8)');
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span>{time}</span>;
};

const fmtNum = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const fmtPct = (n: number | null | undefined) => {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
};
const pctColor = (n: number | null | undefined) => n == null ? '#787b86' : n >= 0 ? '#f23645' : '#089981';

// Simple linear regression
function linearRegression(data: [number, number, any?][]): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of data) { sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const [x, y] of data) { ssTot += (y - yMean) ** 2; ssRes += (y - (slope * x + intercept)) ** 2; }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

// ===============================
// App Component
// ===============================
function App() {
  const [data, setData] = useState<DataPayload | null>(null);
  const [nodeData, setNodeData] = useState<NodePayload | null>(null);
  const [selectedNode, setSelectedNode] = useState<string>('甘肃.沙河变/220kV.220kV乙母');
  const [nodeSearch, setNodeSearch] = useState('');
  const [selectedHours, setSelectedHours] = useState<number[]>([1]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<TimeScale>('hourly');
  const [dateRange, setDateRange] = useState<string>('1M');
  const [selectedBiddingHours, setSelectedBiddingHours] = useState<number[]>([]);
  const [lastClickedHour, setLastClickedHour] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState<'hour' | 'price' | 'date'>('hour');
  
  // Page 5 specific state
  const [selectedArbitragePair, setSelectedArbitragePair] = useState<[number, number]>([4, 19]);
    const [strategySpreadPointA, setStrategySpreadPointA] = useState<number>(16);
  const [strategySpreadPointB, setStrategySpreadPointB] = useState<number>(14);
const [selectedRollingPeriod, setSelectedRollingPeriod] = useState<number>(1);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [weatherMetric, setWeatherMetric] = useState<'wind'|'solar'|'load'|'hydro'>('wind');
  // Page 2: two-day comparison state
  const [page2Tab, setPage2Tab] = useState<'compare' | 'correlation' | 'timeseries' | 'hedong'>('compare');
  const [compareDateA, setCompareDateA] = useState<string>('');
  const [compareDateB, setCompareDateB] = useState<string>('');
  const [comparePriceType, setComparePriceType] = useState<'price_dayahead' | 'price_realtime'>('price_dayahead');
  const [page, setPage] = useState<PageId>('page1');
  const [activeView, setActiveView] = useState<'overview' | 'detail'>('overview');
  
  // Custom Date Modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  const handleHourClick = (h: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedHour !== null) {
      const start = Math.min(lastClickedHour, h);
      const end = Math.max(lastClickedHour, h);
      const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      setSelectedBiddingHours(prev => Array.from(new Set([...prev, ...range])).sort((a, b) => a - b));
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedBiddingHours(prev => 
        prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b)
      );
    } else {
      if (selectedBiddingHours.length === 1 && selectedBiddingHours[0] === h) {
        setSelectedBiddingHours([]); 
      } else {
        setSelectedBiddingHours([h]);
      }
    }
    setLastClickedHour(h);
  };

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [legendState, setLegendState] = useState<Record<string, Record<string, boolean>>>({});
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [lastClickedLegend, setLastClickedLegend] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      if (e.ctrlKey || e.metaKey) setIsCtrlPressed(true); 
      if (e.shiftKey) setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => { 
      if (!e.ctrlKey && !e.metaKey) setIsCtrlPressed(false); 
      if (!e.shiftKey) setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleBlur = () => { setIsCtrlPressed(false); setIsShiftPressed(false); };
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    setLegendState({});
    setLastClickedLegend({});
  }, [dateRange, page, activeView, timeScale]);

  const handleLegendSelect = (chartId: string, params: any) => {
    const clickedName = params.name;
    const currentSelected = params.selected;
    const allNames = Object.keys(currentSelected);

    let newSelected: Record<string, boolean> = {};

    if (isShiftPressed && lastClickedLegend[chartId]) {
      const lastIdx = allNames.indexOf(lastClickedLegend[chartId]);
      const currIdx = allNames.indexOf(clickedName);
      
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        allNames.forEach((name, idx) => {
          newSelected[name] = (idx >= start && idx <= end);
        });
      } else {
        newSelected = { ...currentSelected };
      }
    } else if (isCtrlPressed) {
      newSelected = { ...currentSelected };
      setLastClickedLegend(prev => ({ ...prev, [chartId]: clickedName }));
    } else {
      allNames.forEach(name => {
        newSelected[name] = (name === clickedName);
      });
      setLastClickedLegend(prev => ({ ...prev, [chartId]: clickedName }));
    }
    
    setLegendState(prev => ({ ...prev, [chartId]: newSelected }));
  };

  useEffect(() => {
    echarts.connect('sync-overview');
    echarts.connect('weather-compare');
  }, []);

  useEffect(() => {
    fetch('/data.json')
      .then(r => r.json())
      .then((d: DataPayload) => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
    fetch('/nodes.json')
      .then(r => r.ok ? r.json() : null)
      .then((d: NodePayload | null) => { if (d) setNodeData(d); })
      .catch(() => {});
  }, []);

  const currentData = useMemo(() => {
    let raw: DataRecord[] = [];
    if (!data) return raw;
    if (timeScale === 'hourly') raw = data.hourly;
    if (timeScale === 'daily') raw = data.daily;
    if (timeScale === 'weekly') raw = data.weekly;
    if (timeScale === 'monthly') raw = data.monthly;

    if (dateRange === 'All' || raw.length === 0) return raw;

    let maxDateStr = "";
    let maxRow = null;
    for (let i = raw.length - 1; i >= 0; i--) {
      const r = raw[i];
      if (r.price_dayahead != null || r.price_realtime != null || r.load != null || 
          r.wind != null || r.solar != null || r.hydro != null || r.interconnect != null) {
        maxRow = r;
        break;
      }
    }
    if (!maxRow && raw.length > 0) maxRow = raw[raw.length - 1];

    if (maxRow) {
      maxDateStr = maxRow.date || maxRow.date_str || maxRow.week || maxRow.month || "";
      if (maxDateStr) {
        if (maxRow.week) {
           const y = parseInt(maxRow.week.substring(0, 4));
           const w = parseInt(maxRow.week.substring(6));
           maxDateStr = dayjs(`${y}-01-01`).add((w - 1) * 7, 'day').format('YYYY-MM-DD');
        } else if (maxRow.month) {
           maxDateStr += '-01';
        }
      }
    }
    let targetEnd = dayjs(maxDateStr);
    let targetStart = targetEnd;

    let days = 0;
    switch (dateRange) {
      case '1D': days = 1; break;
      case '5D': days = 5; break;
      case '1M': days = 30; break;
      case '3M': days = 90; break;
      case '6M': days = 180; break;
      case '1Y': days = 365; break;
      case '5Y': days = 1825; break;
    }
    if (days > 0) targetStart = targetEnd.subtract(days, 'day');
    
    if (dateRange === 'YTD') {
      targetStart = dayjs(`${targetEnd.year()}-01-01`);
    } else if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      targetStart = dayjs(customDateStart);
      targetEnd = dayjs(customDateEnd);
    }

    const filtered = raw.filter((r: any) => {
      let dStr = r.date || r.date_str;
      if (!dStr) {
         if (r.week) {
           const y = parseInt(r.week.substring(0, 4));
           const w = parseInt(r.week.substring(6));
           dStr = dayjs(`${y}-01-01`).add((w - 1) * 7, 'day').format('YYYY-MM-DD');
         }
         else if (r.month) dStr = r.month + '-01';
      }
      if (!dStr) return true;
      const d = dayjs(dStr);
      return (d.isAfter(targetStart) || d.isSame(targetStart, 'day')) && (d.isBefore(targetEnd) || d.isSame(targetEnd, 'day'));
    });
    return filtered;
  }, [data, timeScale, dateRange, customDateStart, customDateEnd]);

  const filteredRollingData = useMemo(() => {
    if (!data || !data.rolling || data.rolling.length === 0) return [];
    
    let minDate = data.meta.date_range.start;
    let maxDate = selectedDate || data.meta.date_range.end;
    
    if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      minDate = customDateStart;
      maxDate = customDateEnd;
    } else if (dateRange !== 'All' && selectedDate) {
      const maxDateObj = new Date(selectedDate);
      let days = 30;
      switch (dateRange) {
        case '1D': days = 1; break;
        case '5D': days = 5; break;
        case '1M': days = 30; break;
        case '3M': days = 90; break;
        case '6M': days = 180; break;
        case '1Y': days = 365; break;
        case '5Y': days = 1825; break;
        case 'YTD': 
          minDate = `${maxDateObj.getFullYear()}-01-01`;
          days = -1;
          break;
        default: days = 30;
      }
      if (days > 0) {
        minDate = new Date(maxDateObj.getTime() - (days - 1) * 24 * 3600 * 1000).toISOString().split('T')[0];
      }
    }
    
    return data.rolling.filter((r: any) => r.target_date >= minDate && r.target_date <= maxDate);
  }, [data, dateRange, selectedDate, customDateStart, customDateEnd]);

  const rollingDatesCount = useMemo(() => {
    return new Set(filteredRollingData.map((r: any) => r.target_date)).size;
  }, [filteredRollingData]);

  const xLabels = useMemo(() => {
    return currentData.map((r: any) => {
      if (timeScale === 'hourly') return `${r.date} ${String(r.period).padStart(2, '0')}:00`;
      return r.date || r.week || r.month || '';
    });
  }, [currentData, timeScale]);

  const dayData = useMemo(() => {
    if (!data || !selectedDate) return null;
    return data.hourly.filter(r => r.date === selectedDate);
  }, [data, selectedDate]);

  useEffect(() => {
    if (data && data.daily.length > 0) {
      let latestOpDate = data.daily[data.daily.length - 1].date;
      for (let i = data.daily.length - 1; i >= 0; i--) {
        if (data.daily[i].load != null || data.daily[i].price_dayahead != null) {
          latestOpDate = data.daily[i].date;
          break;
        }
      }
      setSelectedDate(latestOpDate!);
    }
  }, [data]);

  // Stats for watchlist
  const latestStats = useMemo(() => {
    if (!data || !data.daily.length) return null;
    let latest = data.daily[data.daily.length - 1];
    let prev = data.daily.length > 1 ? data.daily[data.daily.length - 2] : latest;
    
    // Find latest valid operations record
    for (let i = data.daily.length - 1; i >= 0; i--) {
      if (data.daily[i].load != null) {
        latest = data.daily[i];
        if (i > 0) prev = data.daily[i - 1];
        else prev = latest;
        break;
      }
    }

    const pctChange = (c: number | null, p: number | null) => c == null || p == null || p === 0 ? null : (c - p) / Math.abs(p) * 100;
    let lp = latest, pp = prev;
    for (let i = data.daily.length - 1; i >= 0; i--) {
      if (data.daily[i].price_dayahead != null) { lp = data.daily[i]; if (i > 0) pp = data.daily[i - 1]; break; }
    }
    return {
      load: { last: latest.load, chg: pctChange(latest.load, prev.load) },
      wind: { last: latest.wind, chg: pctChange(latest.wind, prev.wind) },
      solar: { last: latest.solar, chg: pctChange(latest.solar, prev.solar) },
      hydro: { last: latest.hydro, chg: pctChange(latest.hydro, prev.hydro) },
      interconnect: { last: latest.interconnect, chg: pctChange(latest.interconnect, prev.interconnect) },
      price: { last: lp.price_dayahead, chg: pctChange(lp.price_dayahead, pp.price_dayahead) },
    };
  }, [data]);

  const availableDates = useMemo(() => data ? data.daily.map(r => r.date!) : [], [data]);

  const isLargeDataset = currentData.length > 500;

  // ===== CHART BUILDERS =====

  // -- Page 1: Overview --
  const buildOverviewChart = () => {
    if (!currentData.length) return {};
    const keys = ['load', 'wind', 'solar', 'hydro', 'interconnect'];
    return {
      animation: false,
      title: { text: '边界条件', left: 8, top: 4, textStyle: { color: '#131722', fontSize: 14, fontWeight: 600 } },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 }, confine: true,
        formatter: (p: any) => {
          if (Array.isArray(p)) {
            const timeName = p.length > 0 ? (p[0].name || xLabels[p[0].dataIndex] || '') : '';
            let html = `<div style="font-weight:600;margin-bottom:4px;">${timeName}</div>`;
            const seen = new Set();
            p.forEach((item: any) => {
              if (seen.has(item.seriesName)) return;
              seen.add(item.seriesName);
              const val = Array.isArray(item.value) ? item.value[1] : item.value;
              if (val == null) return;
              html += `<div style="display:flex;justify-content:space-between;width:150px;">
                        <span style="color:${item.color}">${item.seriesName}</span>
                        <span style="font-weight:600">${Number(val).toFixed(0)}</span>
                       </div>`;
            });
            return html;
          } else {
            const val = Array.isArray(p.value) ? p.value[1] : p.value;
            if (val == null) return '';
            const name = p.name || xLabels[p.dataIndex] || '';
            return `<div style="font-weight:600;margin-bottom:4px;color:${p.color}">${p.seriesName}</div>
                    <div style="display:flex;justify-content:space-between;width:150px;">
                      <span style="color:#787b86">时间:</span>
                      <span>${name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;width:150px;">
                      <span style="color:#787b86">数值:</span>
                      <span style="font-weight:600">${Number(val).toFixed(0)}</span>
                    </div>`;
          }
        }
      },
      legend: { data: keys.map(k => METRICS[k].label), top: 4, right: 60, textStyle: { color: '#131722', fontSize: 11 }, icon: 'roundRect', itemWidth: 14, itemHeight: 3, selected: legendState['overview'] },
      grid: { left: 60, right: 56, top: 36, bottom: 40, containLabel: false },
      xAxis: { 
        type: 'category', data: xLabels, boundaryGap: false, 
        axisLabel: { color: '#787b86', fontSize: 10, interval: 'auto', hideOverlap: true }, 
        axisLine: { lineStyle: { color: '#e0e3eb' } }, splitLine: { show: false },
        axisPointer: { show: true, type: 'line', snap: true, label: { show: false }, lineStyle: { color: '#131722', width: 1, type: 'dashed', opacity: 0.5 } }
      },
      yAxis: { 
        type: 'value', position: 'right', axisLabel: { color: '#131722', fontSize: 11 }, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLine: { show: false }, axisTick: { show: false },
        axisPointer: { show: true, type: 'line', snap: false, triggerEmphasis: false, label: { show: false }, lineStyle: { color: '#131722', width: 1, type: 'dashed', opacity: 0.5 } }
      },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }],
      series: keys.map(k => ({
        name: METRICS[k].label, type: 'line', data: currentData.map((r: any) => r[k]),
        itemStyle: { color: METRICS[k].color, opacity: 0 }, emphasis: { itemStyle: { opacity: 1 } },
        lineStyle: { width: k === 'load' ? 2 : 1.5 },
        symbol: 'circle', showSymbol: true, symbolSize: 8, triggerLineEvent: true,
        sampling: isLargeDataset ? 'lttb' : undefined, large: isLargeDataset,
        ...(k === 'load' ? { areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(242,54,69,0.08)' }, { offset: 1, color: 'rgba(242,54,69,0)' }] } } } : {})
      }))
    };
  };

  const buildPriceChart = () => {
    if (!currentData.length) return {};
    return {
      animation: false,
      title: { text: '竞价空间与价格', left: 8, top: 4, textStyle: { color: '#131722', fontSize: 14, fontWeight: 600 } },
      tooltip: { 
        trigger: 'axis', backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 }, confine: true,
        formatter: (p: any) => {
          if (!Array.isArray(p)) p = [p];
          let html = `<div style="font-weight:600;margin-bottom:4px;">${p[0].name}</div>`;
          const seen = new Set();
          p.forEach((item: any) => {
            if (seen.has(item.seriesName)) return;
            seen.add(item.seriesName);
            if (item.value == null) return;
            const val = Number(item.value);
            const unit = item.seriesName === '竞价空间' ? 'MW' : '元';
            const displayVal = item.seriesName === '竞价空间' ? val.toFixed(0) : val.toFixed(2);
            html += `<div style="display:flex;justify-content:space-between;width:160px;">
                      <span style="color:${item.color}">${item.seriesName}</span>
                      <span style="font-weight:600">${displayVal} <span style="font-size:10px;color:#787b86">${unit}</span></span>
                     </div>`;
          });
          return html;
        }
      },
      legend: { data: ['竞价空间', '日前价格', '实时价格'], top: 4, right: 60, textStyle: { color: '#131722', fontSize: 11 }, icon: 'roundRect', itemWidth: 14, itemHeight: 3, selected: legendState['price'] },
      grid: { left: 60, right: 56, top: 36, bottom: 40, containLabel: false },
      xAxis: { 
        type: 'category', data: xLabels, boundaryGap: false, 
        axisLabel: { color: '#787b86', fontSize: 10, interval: 'auto', hideOverlap: true }, 
        axisLine: { lineStyle: { color: '#e0e3eb' } }, splitLine: { show: false },
        axisPointer: { show: true, type: 'line', snap: true, label: { show: false }, lineStyle: { color: '#131722', width: 1, type: 'dashed', opacity: 0.5 } }
      },
      yAxis: [
        { 
          type: 'value', position: 'left', name: 'MW', nameTextStyle: { color: '#787b86', align: 'right', padding: [0, 8, 0, 0] },
          axisLabel: { color: '#787b86', fontSize: 11 }, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLine: { show: false }, axisTick: { show: false },
        },
        { 
          type: 'value', position: 'right', name: '元/MWh', nameTextStyle: { color: '#787b86', align: 'left', padding: [0, 0, 0, 8] },
          axisLabel: { color: '#131722', fontSize: 11 }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false },
          axisPointer: { show: true, type: 'line', snap: false, triggerEmphasis: false, label: { show: false }, lineStyle: { color: '#131722', width: 1, type: 'dashed', opacity: 0.5 } }
        }
      ],
      dataZoom: [{ type: 'inside', start: 0, end: 100 }],
      series: [
        { 
          name: '竞价空间', type: 'line', data: currentData.map((r: any) => r.bidding_space), yAxisIndex: 0,
          itemStyle: { color: METRICS.bidding_space.color }, lineStyle: { width: 1.5 }, symbol: 'none', sampling: isLargeDataset ? 'lttb' : undefined,
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(30,64,175,0.2)' }, { offset: 1, color: 'rgba(30,64,175,0)' }] } }
        },
        { name: '日前价格', type: 'line', data: currentData.map((r: any) => r.price_dayahead), yAxisIndex: 1, itemStyle: { color: METRICS.price_dayahead.color }, lineStyle: { width: 1.5 }, symbol: 'none', sampling: isLargeDataset ? 'lttb' : undefined },
        { name: '实时价格', type: 'line', data: currentData.map((r: any) => r.price_realtime), yAxisIndex: 1, itemStyle: { color: METRICS.price_realtime.color }, lineStyle: { width: 1.5 }, symbol: 'none', sampling: isLargeDataset ? 'lttb' : undefined },
      ]
    };
  };

  const buildDayChart = () => {
    if (!dayData?.length) return {};
    const keys = ['load', 'wind', 'solar', 'hydro', 'interconnect'];
    return {
      animation: false,
      tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 } },
      legend: { data: keys.map(k => METRICS[k].label), top: 4, right: 60, textStyle: { color: '#131722', fontSize: 11 }, icon: 'roundRect', itemWidth: 14, itemHeight: 3, selected: legendState['day'] },
      grid: { left: 8, right: 56, top: 36, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: dayData.map(r => `${r.period}`), boundaryGap: false, axisLabel: { color: '#787b86', fontSize: 11 }, axisLine: { lineStyle: { color: '#e0e3eb' } }, splitLine: { show: true, lineStyle: { color: '#f0f3fa' } } },
      yAxis: { type: 'value', position: 'right', axisLabel: { color: '#131722', fontSize: 11 }, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLine: { show: false }, axisTick: { show: false } },
      series: keys.map(k => ({
        name: METRICS[k].label, type: 'line', data: dayData.map(r => (r as any)[k]),
        itemStyle: { color: METRICS[k].color }, lineStyle: { width: k === 'load' ? 2.5 : 1.5 },
        symbol: 'circle', symbolSize: 4,
        ...(k === 'load' ? { areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(242,54,69,0.1)' }, { offset: 1, color: 'rgba(242,54,69,0)' }] } } } : {})
      }))
    };
  };

  // -- Page 2: Scatter + Regression --
  const buildScatterChart = (xKey: string, yKey: string, xLabel: string, yLabel: string, color: string) => {
    const raw = currentData;
    const pairs: [number, number, string][] = [];
    raw.forEach((r: any) => {
      const x = r[xKey], y = r[yKey];
      if (x != null && y != null && isFinite(x) && isFinite(y)) {
         let dateLabel = r.date || r.date_str || r.week || r.month || '';
         if (timeScale === 'hourly') dateLabel = `${r.date} ${String(r.period).padStart(2, '0')}:00`;
         pairs.push([x, y, dateLabel]);
      }
    });
    if (pairs.length < 2) return {};

    const reg = linearRegression(pairs);
    const xMin = Math.min(...pairs.map(p => p[0]));
    const xMax = Math.max(...pairs.map(p => p[0]));
    const regLine = [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]];

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (p.seriesType === 'scatter') {
            const v = p.value || p.data || [];
            return `时间: ${v[2] || '—'}<br/>${xLabel}: ${v[0]?.toFixed(2)}<br/>${yLabel}: ${v[1]?.toFixed(2)}`;
          }
          return '';
        },
        backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 }
      },
      grid: { left: 16, right: 60, top: 64, bottom: 40, containLabel: true },
      title: {
        text: `${yLabel} vs ${xLabel}`,
        subtext: `R² = ${reg.r2.toFixed(4)}  |  y = ${reg.slope.toFixed(4)}x + ${reg.intercept.toFixed(2)}  |  N = ${pairs.length}`,
        left: 12, top: 4,
        textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 },
        subtextStyle: { color: '#787b86', fontSize: 11 }
      },
      xAxis: { type: 'value', name: xLabel, nameLocation: 'center', nameGap: 24,
        nameTextStyle: { color: '#787b86', fontSize: 11 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { lineStyle: { color: '#e0e3eb' } } },
      yAxis: { type: 'value', name: yLabel, nameLocation: 'center', nameGap: 44,
        nameTextStyle: { color: '#787b86', fontSize: 11 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { show: false } },
      series: [
        { type: 'scatter', data: pairs, symbolSize: 4,
          itemStyle: { color, opacity: 0.5 },
          large: pairs.length > 1000, largeThreshold: 1000 },
        { type: 'line', data: regLine, symbol: 'none',
          lineStyle: { color, width: 2, type: 'dashed' },
          tooltip: { show: false } }
      ]
    };
  };

  const buildWeatherTimeSeriesChart = (weatherKey: string, outputKey: string, weatherLabel: string, outputLabel: string, color: string) => {
    let raw = currentData;
    const xData: string[] = [];
    const weatherData: (number | null)[] = [];
    const outputData: (number | null)[] = [];
    
    raw.forEach((r: any) => {
      let dateLabel = r.date || r.date_str || r.week || r.month || '';
      if (timeScale === 'hourly') dateLabel = `${r.date} ${String(r.period).padStart(2, '0')}:00`;
      xData.push(dateLabel);
      weatherData.push(r[weatherKey] != null ? r[weatherKey] : null);
      outputData.push(r[outputKey] != null ? r[outputKey] : null);
    });

    return {
      tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 } },
      legend: { data: [weatherLabel, outputLabel], top: 4, textStyle: { fontSize: 11, color: '#787b86' } },
      grid: { left: 45, right: 45, top: 30, bottom: 20 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 9, color: '#787b86' }, axisLine: { lineStyle: { color: '#e0e3eb' } } },
      yAxis: [
        { type: 'value', name: outputLabel, scale: true, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } },
        { type: 'value', name: weatherLabel, scale: true, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } }
      ],
      series: [
        { name: outputLabel, type: 'line', data: outputData, yAxisIndex: 0, itemStyle: { color: color }, symbol: 'none', lineStyle: { width: 1.5 } },
        { name: weatherLabel, type: 'line', data: weatherData, yAxisIndex: 1, itemStyle: { color: '#787b86' }, symbol: 'none', lineStyle: { width: 1.5, type: 'dashed' } }
      ]
    };
  };

  // -- Page 2: Two-day weather comparison helpers --
  const hourlyByDate = useMemo(() => {
    const m: Record<string, (DataRecord | null)[]> = {};
    if (!data) return m;
    data.hourly.forEach(r => {
      if (!r.date || r.period == null) return;
      if (!m[r.date]) m[r.date] = new Array(24).fill(null);
      if (r.period >= 1 && r.period <= 24) m[r.date][r.period - 1] = r;
    });
    return m;
  }, [data]);

  const getDayValues = (date: string, key: string): (number | null)[] => {
    const recs = hourlyByDate[date];
    const arr: (number | null)[] = new Array(24).fill(null);
    if (!recs) return arr;
    for (let i = 0; i < 24; i++) {
      const v = recs[i] ? (recs[i] as any)[key] : null;
      arr[i] = v != null ? v : null;
    }
    return arr;
  };

  const dayMean = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => v != null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  // Effective comparison dates: default A = selected date (or data end), B = day before A
  const cmpDateA = compareDateA || selectedDate || data?.meta.date_range.end || '';
  const cmpDateB = compareDateB || (cmpDateA ? dayjs(cmpDateA).subtract(1, 'day').format('YYYY-MM-DD') : '');

  const buildDayCompareChart = (key: string, unit: string, color: string, dateA: string, dateB: string,
      output?: { key: string; label: string; unit: string; color: string }) => {
    const hours = Array.from({ length: 24 }, (_, i) => String(i + 1));
    const a = getDayValues(dateA, key);
    const b = getDayValues(dateB, key);
    const outAName = output ? `${output.label}(A)` : '';
    const outBName = output ? `${output.label}(B)` : '';
    const barSeries = output ? [
      { name: outAName, type: 'bar', data: getDayValues(dateA, output.key), yAxisIndex: 1, barWidth: '45%',
        itemStyle: { color: output.color, opacity: 0.7 } },
      { name: outBName, type: 'bar', data: getDayValues(dateB, output.key), yAxisIndex: 1, barGap: '-100%',
        itemStyle: { color: 'transparent', borderColor: output.color, borderWidth: 1.5, borderType: 'dashed' as const, opacity: 0.9 } }
    ] : [];
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(19, 23, 34, 0.92)', borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        ...(output ? {
          formatter: (params: any[]) => {
            if (!params || !params.length) return '';
            const rows = [`${params[0].axisValue}时`];
            params.forEach((p: any) => {
              const u = (p.seriesName === outAName || p.seriesName === outBName) ? output.unit : unit;
              rows.push(`${p.marker} ${p.seriesName}: ${p.value == null ? '-' : Number(p.value).toFixed(2) + ' ' + u}`);
            });
            return rows.join('<br/>');
          }
        } : {
          valueFormatter: (v: any) => (v == null ? '-' : `${Number(v).toFixed(2)} ${unit}`)
        })
      },
      legend: output
        ? { data: [dateA, dateB, outAName, outBName], top: 0, left: 'center', textStyle: { fontSize: 10, color: '#4b5563' }, itemWidth: 14, itemHeight: 3, icon: 'roundRect' }
        : { data: [dateA, dateB], top: 0, right: 0, textStyle: { fontSize: 10, color: '#4b5563' }, itemWidth: 14, itemHeight: 3, icon: 'roundRect' },
      grid: { left: 42, right: output ? 42 : 12, top: 24, bottom: 20 },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 9, interval: 3, color: '#787b86' }, axisLine: { lineStyle: { color: '#e0e3eb' } }, axisTick: { show: false } },
      yAxis: output ? [
        { type: 'value', scale: true, name: unit, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { lineStyle: { color: '#f0f3fa' } } },
        { type: 'value', scale: true, name: output.unit, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } }
      ] : { type: 'value', scale: true, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { lineStyle: { color: '#f0f3fa' } } },
      series: [
        { name: dateA, type: 'line', data: a, connectNulls: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2, color }, itemStyle: { color } },
        { name: dateB, type: 'line', data: b, connectNulls: true, symbol: 'circle', symbolSize: 3, lineStyle: { width: 1.5, color: '#94a3b8', type: 'dashed' }, itemStyle: { color: '#94a3b8' } },
        ...barSeries
      ]
    };
  };

  const buildDayPriceCompareChart = (dateA: string, dateB: string, priceKey: 'price_dayahead' | 'price_realtime') => {
    return buildDayCompareChart(priceKey, '元/MWh', priceKey === 'price_dayahead' ? '#e040fb' : '#ff6d00', dateA, dateB);
  };

  const renderWeatherCompareCard = (item: { key: string; label: string; unit: string; color: string; outKey?: string; outLabel?: string; outColor?: string }) => {
    const ma = dayMean(getDayValues(cmpDateA, item.key));
    const mb = dayMean(getDayValues(cmpDateB, item.key));
    const delta = ma != null && mb != null ? ma - mb : null;
    return (
      <div key={item.key} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: item.color, marginRight: 6 }} />
            {item.label} <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>{item.unit}</span>
          </span>
          <span style={{ fontSize: '11px', color: '#787b86' }}>
            A均 <b style={{ color: '#131722' }}>{ma != null ? ma.toFixed(2) : '-'}</b>
            {' · '}B均 <b style={{ color: '#131722' }}>{mb != null ? mb.toFixed(2) : '-'}</b>
            {' · '}Δ <b style={{ color: delta != null && delta >= 0 ? '#f23645' : '#089981' }}>{delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(2) : '-'}</b>
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactECharts
            option={buildDayCompareChart(item.key, item.unit, item.color, cmpDateA, cmpDateB,
              item.outKey ? { key: item.outKey, label: item.outLabel!, unit: 'MW', color: item.outColor! } : undefined)}
            style={{ height: '100%', width: '100%' }}
            notMerge
            onChartReady={(c: any) => { c.group = 'weather-compare'; }}
          />
        </div>
      </div>
    );
  };

  const renderPriceCompareCard = () => (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722' }}>两日价格对比 <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>元/MWh</span></span>
        <div style={{ display: 'flex', gap: '2px', background: '#f0f3fa', borderRadius: '6px', padding: '2px' }}>
          {([['price_dayahead', '日前'], ['price_realtime', '实时']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setComparePriceType(id)}
              style={{
                padding: '2px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
                fontWeight: comparePriceType === id ? 600 : 400,
                background: comparePriceType === id ? '#fff' : 'transparent',
                color: comparePriceType === id ? '#2962ff' : '#787b86',
                boxShadow: comparePriceType === id ? '0 1px 2px rgba(19,23,34,0.1)' : 'none'
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactECharts option={buildDayPriceCompareChart(cmpDateA, cmpDateB, comparePriceType)} style={{ height: '100%', width: '100%' }} notMerge />
      </div>
    </div>
  );

  const renderTimeSeriesCard = () => (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722' }}>气象-出力时序</span>
        <select value={weatherMetric} onChange={e => setWeatherMetric(e.target.value as any)}
          style={{ padding: '3px 8px', border: '1px solid #e0e3eb', borderRadius: '6px', outline: 'none', fontSize: '11px', color: '#4b5563', background: '#f5f7fa', cursor: 'pointer' }}>
          <option value="wind">风电 vs 风速</option>
          <option value="solar">光伏 vs 辐射</option>
          <option value="load">负荷 vs 温度</option>
          <option value="hydro">水电 vs 降水</option>
        </select>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactECharts option={buildWeatherTimeSeriesChart(...WEATHER_TS_CFG[weatherMetric].ts)} style={{ height: '100%', width: '100%' }} notMerge />
      </div>
    </div>
  );

  // -- Page 8: Congestion (阻塞) analysis --
  // spread = node day-ahead clearing price - unified settlement day-ahead price
  const unifiedPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (data) data.hourly.forEach(r => {
      if (r.date && r.period != null && r.price_dayahead != null) m[`${r.date}_${r.period}`] = r.price_dayahead;
    });
    return m;
  }, [data]);

  // Node records restricted to the date window implied by the global range selector
  const nodeRangeData = useMemo(() => {
    if (!nodeData) return [] as (NodeRecord & { unified: number | null; spread: number | null })[];
    let allowed: Set<string> | null = null;
    if (dateRange !== 'All' && (timeScale === 'hourly' || timeScale === 'daily') && currentData.length) {
      allowed = new Set(currentData.map((r: any) => r.date).filter(Boolean));
    }
    return nodeData.hourly
      .filter(r => !allowed || allowed.has(r.date))
      .map(r => {
        const unified = unifiedPriceMap[`${r.date}_${r.period}`] ?? null;
        return { ...r, unified, spread: r.node_price != null && unified != null ? r.node_price - unified : null };
      });
  }, [nodeData, unifiedPriceMap, currentData, dateRange, timeScale]);

  const nodeStats = useMemo(() => {
    const rows = nodeRangeData.filter(r => r.node === selectedNode && r.spread != null);
    if (!rows.length) return null;
    const spreads = rows.map(r => r.spread as number);
    const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    let max = -Infinity, maxRow: typeof rows[0] | null = null;
    rows.forEach(r => { if ((r.spread as number) > max) { max = r.spread as number; maxRow = r; } });
    const freq = spreads.filter(s => s > 0).length / spreads.length * 100;
    return { avg, max, maxTime: maxRow ? `${maxRow.date} ${String(maxRow.period).padStart(2, '0')}:00` : '-', freq };
  }, [nodeRangeData, selectedNode]);

  const buildNodeCompareChart = () => {
    const rows = nodeRangeData.filter(r => r.node === selectedNode);
    const xData = rows.map(r => `${r.date.slice(5)} ${String(r.period).padStart(2, '0')}时`);
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(19,23,34,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any[]) => {
          if (!params || !params.length) return '';
          const i = params[0].dataIndex;
          const r = rows[i];
          const lines = [`${r.date} ${String(r.period).padStart(2, '0')}:00`];
          params.forEach((p: any) => lines.push(`${p.marker} ${p.seriesName}: ${p.value == null ? '-' : Number(p.value).toFixed(2)} 元/MWh`));
          if (r.congestion_price != null) lines.push(`<span style="opacity:.7">阻塞分量: ${r.congestion_price.toFixed(2)} 元/MWh</span>`);
          return lines.join('<br/>');
        } },
      legend: { data: ['节点电价', '统一结算价', '价差'], top: 0, left: 'center', textStyle: { fontSize: 11, color: '#4b5563' } },
      grid: { left: 55, right: 55, top: 30, bottom: 24 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 9, color: '#787b86' }, axisLine: { lineStyle: { color: '#e0e3eb' } } },
      yAxis: [
        { type: 'value', name: '元/MWh', scale: true, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { lineStyle: { color: '#f0f3fa' } } },
        { type: 'value', name: '价差', scale: true, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } }
      ],
      series: [
        { name: '价差', type: 'bar', yAxisIndex: 1, data: rows.map(r => r.spread),
          itemStyle: { color: (p: any) => (p.value ?? 0) >= 0 ? 'rgba(242,54,69,0.55)' : 'rgba(8,153,129,0.55)' } },
        { name: '节点电价', type: 'line', data: rows.map(r => r.node_price), symbol: 'none', lineStyle: { width: 2, color: '#2962ff' }, itemStyle: { color: '#2962ff' } },
        { name: '统一结算价', type: 'line', data: rows.map(r => r.unified), symbol: 'none', lineStyle: { width: 1.5, color: '#94a3b8', type: 'dashed' }, itemStyle: { color: '#94a3b8' } }
      ]
    };
  };

  const nodeRanking = useMemo(() => {
    const acc: Record<string, { sum: number; n: number }> = {};
    nodeRangeData.forEach(r => {
      if (r.spread == null) return;
      if (!acc[r.node]) acc[r.node] = { sum: 0, n: 0 };
      acc[r.node].sum += r.spread; acc[r.node].n++;
    });
    return Object.entries(acc)
      .map(([node, v]) => ({ node, avg: v.sum / v.n }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 20);
  }, [nodeRangeData]);

  const buildNodeRankChart = () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(19,23,34,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
      formatter: (p: any) => `${p[0].name}<br/>平均价差: <b>${Number(p[0].value).toFixed(2)}</b> 元/MWh<br/><span style="opacity:.7;font-size:11px">点击切换选中节点</span>` },
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { lineStyle: { color: '#f0f3fa' } } },
    yAxis: { type: 'category', inverse: true, data: nodeRanking.map(d => d.node),
      axisLabel: { fontSize: 9, color: (v: string) => v === selectedNode ? '#2962ff' : '#4b5563', formatter: (v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v } },
    series: [{ type: 'bar', data: nodeRanking.map(d => ({ value: Number(d.avg.toFixed(2)), itemStyle: { color: d.node === selectedNode ? '#2962ff' : d.avg >= 0 ? '#f23645' : '#089981' } })), barWidth: '60%' }]
  });

  const buildNodeHeatmap = () => {
    if (!nodeData || !nodeRangeData.length) return {};
    // anchor day: latest date inside the current range
    const dates = [...new Set(nodeRangeData.map(r => r.date))].sort();
    const day = (selectedDate && dates.includes(selectedDate)) ? selectedDate : dates[dates.length - 1];
    const rows = nodeRangeData.filter(r => r.date === day && r.spread != null);
    // top 30 nodes by mean |spread| that day
    const acc: Record<string, { sum: number; n: number }> = {};
    rows.forEach(r => { if (!acc[r.node]) acc[r.node] = { sum: 0, n: 0 }; acc[r.node].sum += Math.abs(r.spread as number); acc[r.node].n++; });
    const nodes = Object.entries(acc).sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, 30).map(e => e[0]);
    const nodeIdx: Record<string, number> = {}; nodes.forEach((n, i) => nodeIdx[n] = i);
    const cells = rows.filter(r => nodeIdx[r.node] !== undefined).map(r => [r.period - 1, nodeIdx[r.node], Number((r.spread as number).toFixed(2))]);
    const maxAbs = Math.max(10, ...cells.map(c => Math.abs(c[2])));
    return {
      tooltip: { backgroundColor: 'rgba(19,23,34,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => `${nodes[p.value[1]]}<br/>${day} ${String(p.value[0] + 1).padStart(2, '0')}:00<br/>价差: <b>${p.value[2]}</b> 元/MWh` },
      grid: { left: 8, right: 60, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => `${i + 1}时`), axisLabel: { fontSize: 9, color: '#787b86' }, splitArea: { show: false } },
      yAxis: { type: 'category', data: nodes, axisLabel: { fontSize: 9, color: '#4b5563', formatter: (v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v } },
      visualMap: { min: -maxAbs, max: maxAbs, calculable: true, orient: 'vertical', right: 4, top: 'center',
        textStyle: { fontSize: 9, color: '#787b86' },
        inRange: { color: ['#089981', '#f5f7fa', '#f23645'] } },
      series: [{ type: 'heatmap', data: cells, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 1 } }]
    };
  };

  // -- Page 8: daily evolution (date x 24h) for the selected node --
  const HOUR_LINE_COLORS = ['#2563eb', '#f97316', '#089981', '#d946ef', '#eab308', '#dc2626', '#0ea5e9', '#84cc16', '#8b5cf6', '#f43f5e'];
  const [lastClickedNodeHour, setLastClickedNodeHour] = useState<number | null>(null);

  const nodeDailyGrid = useMemo(() => {
    // spread matrix for selectedNode: dates[] x 24
    const rows = nodeRangeData.filter(r => r.node === selectedNode);
    const dates = [...new Set(rows.map(r => r.date))].sort();
    const di: Record<string, number> = {}; dates.forEach((d, i) => di[d] = i);
    const grid: (number | null)[][] = dates.map(() => new Array(24).fill(null));
    rows.forEach(r => { if (r.period >= 1 && r.period <= 24) grid[di[r.date]][r.period - 1] = r.spread; });
    return { dates, grid };
  }, [nodeRangeData, selectedNode]);

  const toggleHour = (h: number) => {
    setSelectedHours(prev => {
      if (prev.includes(h)) return prev.length > 1 ? prev.filter(x => x !== h) : prev;
      return [...prev, h].sort((a, b) => a - b);
    });
  };

  // pill selection: plain = single, Ctrl = toggle add/remove, Shift = range from last click
  const handleNodeHourClick = (h: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedNodeHour !== null) {
      const start = Math.min(lastClickedNodeHour, h);
      const end = Math.max(lastClickedNodeHour, h);
      const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      setSelectedHours(prev => Array.from(new Set([...prev, ...range])).sort((a, b) => a - b));
    } else if (e.ctrlKey || e.metaKey) {
      toggleHour(h);
    } else {
      setSelectedHours([h]);
    }
    setLastClickedNodeHour(h);
  };

  const buildNodeDailyHeatmap = () => {
    const { dates, grid } = nodeDailyGrid;
    // newest date at the bottom: reverse display order
    const yDates = [...dates].reverse();
    const cells: any[] = [];
    grid.forEach((row, y) => row.forEach((v, x) => { if (v != null) cells.push([x, dates.length - 1 - y, Number(v.toFixed(2))]); }));
    const maxAbs = Math.max(10, ...cells.map(c => Math.abs(c[2])));
    return {
      tooltip: { backgroundColor: 'rgba(19,23,34,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => `${selectedNode}<br/>${yDates[p.value[1]]} ${String(p.value[0] + 1).padStart(2, '0')}:00<br/>价差: <b>${p.value[2]}</b> 元/MWh<br/><span style="opacity:.7;font-size:11px">点击将此小时加入下方趋势</span>` },
      grid: { left: 8, right: 56, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => `${i + 1}时`), axisLabel: { fontSize: 9, color: '#787b86' } },
      yAxis: { type: 'category', data: yDates.map(d => d.slice(5)), axisLabel: { fontSize: 9, color: '#787b86' } },
      visualMap: { min: -maxAbs, max: maxAbs, calculable: true, orient: 'vertical', right: 2, top: 'center',
        textStyle: { fontSize: 9, color: '#787b86' }, inRange: { color: ['#089981', '#f5f7fa', '#f23645'] } },
      series: [{ type: 'heatmap', data: cells, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 1 } }]
    };
  };

  // first-3-days vs last-3-days average spread per selected hour
  const hourEvolutionStats = useMemo(() => {
    const { dates, grid } = nodeDailyGrid;
    const k = Math.min(3, Math.floor(dates.length / 2) || 1);
    return selectedHours.map(h => {
      const col = grid.map(row => row[h - 1]);
      const first = col.slice(0, k).filter((v): v is number => v != null);
      const last = col.slice(-k).filter((v): v is number => v != null);
      const fa = first.length ? first.reduce((a, b) => a + b, 0) / first.length : null;
      const la = last.length ? last.reduce((a, b) => a + b, 0) / last.length : null;
      return { hour: h, firstAvg: fa, lastAvg: la, delta: fa != null && la != null ? la - fa : null };
    });
  }, [nodeDailyGrid, selectedHours]);

  const buildNodeHourTrendChart = () => {
    const { dates, grid } = nodeDailyGrid;
    const ma7 = (col: (number | null)[]) => col.map((_, i) => {
      const win = col.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v != null);
      return win.length ? Number((win.reduce((a, b) => a + b, 0) / win.length).toFixed(2)) : null;
    });
    const series: any[] = [];
    selectedHours.forEach((h, idx) => {
      const color = HOUR_LINE_COLORS[idx % HOUR_LINE_COLORS.length];
      const col = grid.map(row => row[h - 1]);
      series.push({ name: `${h}时`, type: 'line', data: col, connectNulls: true, symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, color }, itemStyle: { color } });
      series.push({ name: `${h}时 MA7`, type: 'line', data: ma7(col), connectNulls: true, symbol: 'none',
        lineStyle: { width: 1.5, color, type: 'dashed', opacity: 0.6 }, itemStyle: { color } });
    });
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(19,23,34,0.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v: any) => (v == null ? '-' : `${Number(v).toFixed(2)} 元`) },
      legend: { data: selectedHours.map(h => `${h}时`), top: 0, left: 'center', textStyle: { fontSize: 10, color: '#4b5563' }, itemWidth: 14, itemHeight: 3 },
      grid: { left: 48, right: 16, top: 26, bottom: 22 },
      xAxis: { type: 'category', data: dates.map(d => d.slice(5)), axisLabel: { fontSize: 9, color: '#787b86' }, axisLine: { lineStyle: { color: '#e0e3eb' } } },
      yAxis: { type: 'value', scale: true, name: '价差 元/MWh', nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { lineStyle: { color: '#f0f3fa' } } },
      series
    };
  };

  // -- Page 3: Bidding Space vs Price --
  const buildBiddingChart = () => {
    if (!data || !data.hourly || data.hourly.length === 0) return {};

    // 1. Determine date range
    let minDate = data.meta.date_range.start;
    let maxDate = selectedDate || data.meta.date_range.end;
    if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      minDate = customDateStart;
      maxDate = customDateEnd;
    } else if (dateRange !== 'All' && selectedDate) {
      const maxDateObj = new Date(selectedDate);
      let days = 30;
      switch (dateRange) {
        case '1D': days = 1; break;
        case '5D': days = 5; break;
        case '1M': days = 30; break;
        case '3M': days = 90; break;
        case '6M': days = 180; break;
        case '1Y': days = 365; break;
        case '5Y': days = 1825; break;
        default: days = 30;
      }
      minDate = new Date(maxDateObj.getTime() - (days - 1) * 24 * 3600 * 1000).toISOString().split('T')[0];
    }

    const filtered = data.hourly.filter(r => r.date && r.date >= minDate && r.date <= maxDate);

    // Global bounds over the full window — axes stay fixed across all four
    // time scales and across hour-pill selections.
    let globalMinX = Infinity, globalMaxX = -Infinity;
    let globalMinY = Infinity, globalMaxY = -Infinity;
    filtered.forEach(r => {
      const bs = r.bidding_space, price = r.price_dayahead;
      if (bs != null && price != null && isFinite(bs) && isFinite(price)) {
        if (bs < globalMinX) globalMinX = bs;
        if (bs > globalMaxX) globalMaxX = bs;
        if (price < globalMinY) globalMinY = price;
        if (price > globalMaxY) globalMaxY = price;
      }
    });
    const padAxis = (lo: number, hi: number): [number, number] => {
      if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
      const p = (hi - lo) * 0.03 || 1;
      return [lo - p, hi + p];
    };
    const [axisXMin, axisXMax] = padAxis(globalMinX, globalMaxX);
    const [axisYMin, axisYMax] = padAxis(globalMinY, globalMaxY);

    // Date color-band: use day-index (0..N) so visualMap never shows raw timestamps
    const winStart = dayjs(minDate);
    const winDays = Math.max(1, dayjs(maxDate).diff(winStart, 'day'));
    const dateVisualMap = (dimension: number, seriesIndex: number | number[]) => ({
      type: 'continuous' as const,
      seriesIndex,
      dimension,
      min: 0,
      max: winDays,
      calculable: false,
      orient: 'vertical' as const,
      right: 10,
      top: 60,
      itemHeight: 120,
      inRange: { color: ['#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444'] },
      text: ['末期', '早期'],
      textStyle: { fontSize: 10, color: '#787b86' }
    });

    // Aggregated scales (日均值/周均值/月均值): aggregate the SAME hourly window
    if (timeScale !== 'hourly') {
      const scaleLabel = timeScale === 'daily' ? '日均值' : timeScale === 'weekly' ? '周均值' : '月均值';
      const groups: Record<string, { bs: number[]; pr: number[]; t: number }> = {};
      filtered.forEach(r => {
        if (r.bidding_space == null || r.price_dayahead == null || !isFinite(r.bidding_space) || !isFinite(r.price_dayahead)) return;
        const d = dayjs(r.date);
        const key = timeScale === 'daily' ? r.date!
          : timeScale === 'weekly' ? `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`
          : d.format('YYYY-MM');
        const dayIdx = d.diff(winStart, 'day');
        if (!groups[key]) groups[key] = { bs: [], pr: [], t: dayIdx };
        groups[key].bs.push(r.bidding_space);
        groups[key].pr.push(r.price_dayahead);
        if (dayIdx < groups[key].t) groups[key].t = dayIdx;
      });
      const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
      const pts: [number, number, string, number][] = Object.keys(groups).sort()
        .map(k => [mean(groups[k].bs), mean(groups[k].pr), k, groups[k].t]);
      const regPairs = pts.map(p => [p[0], p[1], p[2]] as [number, number, string]);
      const reg = regPairs.length >= 2 ? linearRegression(regPairs) : { slope: 0, intercept: 0, r2: 0 };
      let regLine: [number, number][] = [];
      if (regPairs.length >= 2) {
        const xMin = Math.min(...regPairs.map(p => p[0]));
        const xMax = Math.max(...regPairs.map(p => p[0]));
        regLine = [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]];
      }
      return {
        animation: false,
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => {
            const v = p.value || [];
            return `<div style="font-weight:600;margin-bottom:4px">${v[2] || '—'}</div>
                    <div style="font-size:12px;line-height:1.6;">
                      <div><span style="color:#787b86">竞价空间: </span><b style="color:#131722">${Number(v[0]).toFixed(0)} MW</b></div>
                      <div><span style="color:#787b86">日前价格: </span><b style="color:#131722">${Number(v[1]).toFixed(2)} 元/MWh</b></div>
                    </div>`;
          },
          backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 },
          extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 6px; padding: 10px;'
        },
        grid: { left: 16, right: colorMode === 'hour' ? 30 : 60, top: 40, bottom: 40, containLabel: true },
        title: {
          text: `日前竞价空间 vs 日前价格 散点分布图（${scaleLabel}）  |  范围: ${minDate} 至 ${maxDate} | N = ${pts.length} | R² = ${reg.r2.toFixed(4)} | y = ${reg.slope.toFixed(6)}x + ${reg.intercept.toFixed(2)}`,
          left: 12, top: 8,
          textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 }
        },
        visualMap: colorMode === 'hour' ? undefined : colorMode === 'date' ? dateVisualMap(3, 0) : {
          type: 'continuous',
          seriesIndex: 0,
          dimension: 1,
          min: globalMinY !== Infinity ? globalMinY : 0,
          max: globalMaxY !== -Infinity ? globalMaxY : 500,
          calculable: true, orient: 'vertical', right: 10, top: 60, itemHeight: 120,
          inRange: { color: ['#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444'] },
          text: ['高价', '低价'],
          textStyle: { fontSize: 10, color: '#787b86' }
        },
        xAxis: { type: 'value', name: '竞价空间 (MW)', nameLocation: 'center', nameGap: 28, min: axisXMin, max: axisXMax,
          nameTextStyle: { color: '#787b86', fontSize: 11 }, axisLabel: { color: '#131722', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f0f3fa' } } },
        yAxis: { type: 'value', name: '日前价格 (元/MWh)', nameLocation: 'center', nameGap: 40, min: axisYMin, max: axisYMax,
          nameTextStyle: { color: '#787b86', fontSize: 11 }, axisLabel: { color: '#131722', fontSize: 10 },
          splitLine: { lineStyle: { color: '#f0f3fa' } } },
        series: [
          { name: scaleLabel, type: 'scatter', data: pts, symbolSize: 10,
            itemStyle: { color: '#1e40af', opacity: 0.75 }, emphasis: { itemStyle: { opacity: 1 } } },
          ...(regLine.length ? [{ name: '线性回归趋势', type: 'line', data: regLine, symbol: 'none',
            lineStyle: { color: '#131722', width: 2, type: 'dashed' as const }, tooltip: { show: false }, z: 10 }] : [])
        ]
      };
    }

    // Group hourly records into 24 periods
    const hourSeriesMap: Record<number, any[]> = {};
    for (let h = 1; h <= 24; h++) hourSeriesMap[h] = [];

    const allPairs: [number, number, string][] = [];

    const isHourVisible = (h: number) => {
      if (selectedBiddingHours.length === 0) return true;
      return selectedBiddingHours.includes(h);
    };

    filtered.forEach(r => {
      const bs = r.bidding_space;
      const price = r.price_dayahead;
      const period = r.period;
      if (bs != null && price != null && isFinite(bs) && isFinite(price) && period != null && period >= 1 && period <= 24) {
        const timeLabel = `${r.date} ${String(period).padStart(2, '0')}:00`;
        hourSeriesMap[period].push([bs, price, timeLabel, period, dayjs(r.date!).diff(winStart, 'day')]);

        if (isHourVisible(period)) {
          allPairs.push([bs, price, timeLabel]);
        }
      }
    });

    const reg = allPairs.length >= 2 ? linearRegression(allPairs) : { slope: 0, intercept: 0, r2: 0 };
    let regLine: [number, number][] = [];
    if (allPairs.length >= 2) {
      const xMin = Math.min(...allPairs.map(p => p[0]));
      const xMax = Math.max(...allPairs.map(p => p[0]));
      regLine = [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]];
    }

    const seriesList: any[] = [];

    for (let h = 1; h <= 24; h++) {
      const visible = isHourVisible(h);
      const hourName = `${String(h).padStart(2, '0')}:00 时段`;
      const color = HOUR_COLORS_24[h - 1];
      const isSelected = selectedBiddingHours.length > 0 && selectedBiddingHours.includes(h);

      seriesList.push({
        name: hourName,
        type: 'scatter',
        data: visible ? hourSeriesMap[h] : [],
        symbolSize: isSelected ? 8 : 6,
        itemStyle: {
          color: color,
          opacity: isSelected ? 0.9 : 0.75,
          borderColor: 'transparent',
          borderWidth: 0
        },
        emphasis: {
          itemStyle: {
            opacity: 1
          }
        },
        large: hourSeriesMap[h].length > 5000,
        largeThreshold: 5000
      });
    }

    if (regLine.length > 0) {
      seriesList.push({
        name: '线性回归趋势',
        type: 'line',
        data: regLine,
        symbol: 'none',
        lineStyle: { color: '#131722', width: 2, type: 'dashed' },
        tooltip: { show: false },
        z: 10
      });
    }



    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (p.seriesType === 'scatter') {
            const v = p.value || p.data || [];
            return `<div style="font-weight:600;margin-bottom:4px;color:${p.color}">🕒 ${v[2] || '—'}</div>
                    <div style="font-size:12px;line-height:1.6;">
                      <div><span style="color:#787b86">竞价空间: </span><b style="color:#131722">${v[0]?.toFixed(0)} MW</b></div>
                      <div><span style="color:#787b86">日前价格: </span><b style="color:#131722">${v[1]?.toFixed(2)} 元/MWh</b></div>
                    </div>`;
          }
          return '';
        },
        backgroundColor: '#fff', 
        borderColor: '#e0e3eb', 
        textStyle: { color: '#131722', fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 6px; padding: 10px;'
      },
      grid: { left: 16, right: colorMode === 'hour' ? 30 : 60, top: 40, bottom: 40, containLabel: true },
      title: {
        text: `日前竞价空间 vs 日前价格 散点分布图   |   范围: ${minDate} 至 ${maxDate} | N = ${allPairs.length} | R² = ${reg.r2.toFixed(4)} | y = ${reg.slope.toFixed(6)}x + ${reg.intercept.toFixed(2)}`,
        left: 12,
        top: 8,
        textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 }
      },
      visualMap: colorMode === 'hour' ? undefined : colorMode === 'date' ? dateVisualMap(4, Array.from({ length: 24 }, (_, i) => i)) : {
        type: 'continuous',
        seriesIndex: Array.from({ length: 24 }, (_, i) => i),
        dimension: 1,
        min: globalMinY !== Infinity ? globalMinY : 0,
        max: globalMaxY !== -Infinity ? globalMaxY : 500,
        calculable: true,
        orient: 'vertical',
        right: 10,
        top: 60,
        itemHeight: 120,
        inRange: {
          color: ['#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444']
        },
        text: ['高价', '低价'],
        textStyle: { fontSize: 10, color: '#787b86' }
      },
      xAxis: {
        type: 'value',
        name: '竞价空间 (MW)',
        nameLocation: 'center',
        nameGap: 28,
        min: axisXMin,
        max: axisXMax,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 500 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { lineStyle: { color: '#e0e3eb' } }
      },
      yAxis: {
        type: 'value',
        name: '日前价格 (元/MWh)',
        nameLocation: 'center',
        nameGap: 48,
        min: axisYMin,
        max: axisYMax,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 500 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { show: false }
      },
      series: seriesList
    };
  };

  // -- Page 4: Spot Price Comparison --
  const buildPriceComparisonChart = () => {
    if (!data || !data.hourly) return {};
    
    // Determine the date range based on global selector
    let minDate = data.meta.date_range.start;
    let maxDate = selectedDate || data.meta.date_range.end;
    if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      minDate = customDateStart;
      maxDate = customDateEnd;
    } else if (dateRange !== 'All' && selectedDate) {
      const maxDateObj = new Date(selectedDate);
      let days = 30;
      switch (dateRange) {
        case '1D': days = 1; break;
        case '5D': days = 5; break;
        case '1M': days = 30; break;
        case '3M': days = 90; break;
        case '6M': days = 180; break;
        case '1Y': days = 365; break;
        case '5Y': days = 1825; break;
        default: days = 30;
      }
      minDate = new Date(maxDateObj.getTime() - (days - 1) * 24 * 3600 * 1000).toISOString().split('T')[0];
    }
    
    const grouped: Record<string, (number | null)[]> = {};
    data.hourly.forEach(r => {
      if (r.date && r.date >= minDate && r.date <= maxDate) {
        if (!grouped[r.date]) grouped[r.date] = new Array(24).fill(null);
        if (r.period != null && r.period >= 1 && r.period <= 24) {
          grouped[r.date][r.period - 1] = r.price_dayahead;
        }
      }
    });
    
    const dates = Object.keys(grouped).sort();
    if (dates.length === 0) return {};
    
    const latestDateStr = dates[dates.length - 1];
    
    const series = dates.map(date => ({
      name: date,
      type: 'line',
      data: grouped[date],
      smooth: false,
      symbol: 'circle',
      showSymbol: true,
      symbolSize: 8,
      itemStyle: { color: date === latestDateStr ? '#f23645' : undefined, opacity: 0 },
      emphasis: { itemStyle: { opacity: 1 } },
      triggerLineEvent: true,
      lineStyle: { width: date === latestDateStr ? 3 : 1.5 },
      z: date === latestDateStr ? 10 : 1
    }));

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 },
        formatter: (p: any) => {
          return `<div style="font-weight:600;margin-bottom:4px;color:${p.color}">${p.seriesName}</div>
                  <div style="display:flex;justify-content:space-between;width:150px;">
                    <span style="color:#787b86">时刻:</span>
                    <span>${p.name}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;width:150px;">
                    <span style="color:#787b86">日前价格:</span>
                    <span style="font-weight:600">${p.value != null ? Number(p.value).toFixed(2) : '—'}</span>
                  </div>`;
        }
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 40,
        bottom: 20,
        textStyle: { color: '#131722', fontSize: 11 },
        pageIconColor: '#2962ff',
        selected: legendState['compare']
      },
      grid: { left: 16, right: 120, top: 80, bottom: 40, containLabel: true },
      title: {
        text: '日前价格(结算) 24时段走势对比',
        subtext: `时间窗口: ${dateRange} (${minDate} 至 ${selectedDate})`,
        left: 12, top: 4,
        textStyle: { color: '#131722', fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: '#787b86', fontSize: 11, lineHeight: 16 }
      },
      xAxis: {
        type: 'category',
        data: Array.from({length: 24}, (_, i) => `${String(i + 1).padStart(2, '0')}:00`),
        name: '时刻', nameLocation: 'end',
        axisLabel: { color: '#131722', fontSize: 10 },
        axisLine: { lineStyle: { color: '#e0e3eb' } }
      },
      yAxis: {
        type: 'value',
        name: '日前价格 (元/MWh)',
        nameLocation: 'end',
        nameTextStyle: { color: '#787b86', fontSize: 12 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { show: false }
      },
      series
    };
  };

  // -- Page 5: Arbitrage Analysis --
  const getArbitrageData = () => {
    if (!data || !data.hourly) return { heatmapData: [], trendData: [], histData: [], avgPrices: {} };
    
    let minDate = data.meta.date_range.start;
    let maxDate = selectedDate || data.meta.date_range.end;
    if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      minDate = customDateStart;
      maxDate = customDateEnd;
    } else if (dateRange !== 'All' && selectedDate) {
      const maxDateObj = new Date(selectedDate);
      let days = 30;
      switch (dateRange) {
        case '1D': days = 1; break;
        case '5D': days = 5; break;
        case '1M': days = 30; break;
        case '3M': days = 90; break;
        case '6M': days = 180; break;
        case '1Y': days = 365; break;
        case '5Y': days = 1825; break;
        default: days = 30;
      }
      minDate = new Date(maxDateObj.getTime() - (days - 1) * 24 * 3600 * 1000).toISOString().split('T')[0];
    }

    const filtered = data.hourly.filter(r => r.date && r.date >= minDate && r.date <= maxDate);
    
    // 1. Avg Prices for Heatmap
    const periodPrices: Record<number, number[]> = {};
    for (let i = 1; i <= 24; i++) periodPrices[i] = [];
    filtered.forEach(r => {
      if (r.period != null && r.period >= 1 && r.period <= 24 && r.price_dayahead != null) {
        periodPrices[r.period!].push(r.price_dayahead);
      }
    });
    
    const avgPrices: Record<number, number> = {};
    for (let i = 1; i <= 24; i++) {
      const arr = periodPrices[i];
      avgPrices[i] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }
    
    const heatmapData = [];
    for (let buy = 1; buy <= 24; buy++) {
      for (let sell = 1; sell <= 24; sell++) {
        heatmapData.push([buy - 1, sell - 1, avgPrices[sell] - avgPrices[buy]]);
      }
    }

    // 2. Trend Data for the selected pair
    const dailyData: Record<string, { buy: number | null, sell: number | null }> = {};
    filtered.forEach(r => {
      if (!r.date) return;
      if (!dailyData[r.date]) dailyData[r.date] = { buy: null, sell: null };
      if (r.period === selectedArbitragePair[0]) dailyData[r.date].buy = r.price_dayahead;
      if (r.period === selectedArbitragePair[1]) dailyData[r.date].sell = r.price_dayahead;
    });
    
    const dates = Object.keys(dailyData).sort();
    const trendData = dates.map(d => {
      const { buy, sell } = dailyData[d];
      if (buy != null && sell != null) return { date: d, spread: sell - buy };
      return null;
    }).filter(Boolean);

    // 3. Histogram for the selected pair
    let histData: any[] = [];
    if (trendData.length > 0) {
      const spreads = trendData.map((d: any) => d.spread);
      let minSpread = Math.min(...spreads);
      let maxSpread = Math.max(...spreads);
      if (minSpread === maxSpread) { minSpread -= 10; maxSpread += 10; }
      
      let binCount = 40;
      if (spreads.length <= 31) binCount = 10;
      else if (spreads.length <= 90) binCount = 15;
      else if (spreads.length <= 180) binCount = 20;
      
      const binWidth = (maxSpread - minSpread) / binCount;
      const bins = new Array(binCount).fill(0);
      spreads.forEach((s: any) => {
        let idx = Math.floor((s - minSpread) / binWidth);
        if (idx >= binCount) idx = binCount - 1;
        bins[idx]++;
      });
      
      histData = bins.map((count, i) => {
        const start = (minSpread + i * binWidth).toFixed(0);
        const end = (minSpread + (i + 1) * binWidth).toFixed(0);
        return { range: `${start}~${end}`, count, binStart: (minSpread + i * binWidth) };
      });
    }

    return { heatmapData, trendData, histData, avgPrices };
  };

  
  const buildStrategyScannerHeatmap = () => {
    if (!strategyScannerData || strategyScannerData.length === 0) return {};
    const periods = Array.from({length: 24}, (_, i) => String(i + 1));
    const values = strategyScannerData.map(d => d[2]);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal));

    return {
      title: {
        text: '全时段平均套利空间矩阵 (日前 - 现货)',
        left: 4,
        top: 0,
        textStyle: { color: '#131722', fontSize: 16, fontWeight: 700 }
      },
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(19, 23, 34, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => {
          const a = p.value[0] + 1;
          const b = p.value[1] + 1;
          const space = p.value[2].toFixed(2);
          const color = p.value[2] >= 0 ? '#ff8a93' : '#5adbb5';
          return `<div style="font-weight:600;margin-bottom:4px;">时段 A: ${a} &nbsp;→&nbsp; 时段 B: ${b}</div>` +
                 `平均套利空间: <b style="color:${color}">${space}</b> 元/MWh`;
        }
      },
      grid: { top: 34, right: 42, left: 46, bottom: 42 },
      xAxis: {
        type: 'category', data: periods, name: '时段A',
        nameLocation: 'middle', nameGap: 26,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 600 },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, interval: 0, color: '#4b5563', hideOverlap: false }
      },
      yAxis: {
        type: 'category', data: periods, name: '时段B',
        nameLocation: 'middle', nameGap: 28,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 600 },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, interval: 0, color: '#4b5563' }
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: true,
        orient: 'vertical',
        right: 2,
        top: 'center',
        itemWidth: 14,
        itemHeight: 160,
        precision: 0,
        textStyle: { color: '#4b5563', fontSize: 11 },
        inRange: { color: ['#0a8a6d', '#5cc9a7', '#f7f8fa', '#f88d97', '#e5263b'] }
      },
      series: [
        {
          name: '套利空间',
          type: 'heatmap',
          data: strategyScannerData,
          label: { show: false },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1.5 },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0, 0, 0, 0.45)', borderColor: '#131722', borderWidth: 1.5 },
            scaleSize: 4
          }
        },
        {
          name: '当前选中',
          type: 'scatter',
          data: [[strategySpreadPointA - 1, strategySpreadPointB - 1]],
          symbolSize: 16,
          itemStyle: { color: 'rgba(41, 98, 255, 0.12)', borderColor: '#2962ff', borderWidth: 2.5 },
          silent: true,
          z: 3
        }
      ]
    };
  };

  const buildStrategySpreadCombinedChart = () => {
    if (!strategySpreadData || strategySpreadData.length === 0) return {};
    const dates = strategySpreadData.map(d => d.date);
    const da = strategySpreadData.map(d => d.daSpread);
    const rt = strategySpreadData.map(d => d.rtSpread);
    const spaces = strategySpreadData.map(d => d.space);
    const intervalStep = dates.length > 12 ? Math.floor(dates.length / 6) : 0;

    return {
      title: [
        { text: `价差趋势 (时段${strategySpreadPointB} - 时段${strategySpreadPointA})`, left: 8, top: 4, textStyle: { color: '#131722', fontSize: 12, fontWeight: 600 } },
        { text: '套利收益空间 (日前价差 - 加权均价差)', left: 8, top: '50%', textStyle: { color: '#131722', fontSize: 12, fontWeight: 600 } }
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e0e3eb',
        textStyle: { color: '#131722', fontSize: 12 },
        formatter: (params: any) => {
          if (!Array.isArray(params)) params = [params];
          const valid = params.filter((p: any) => p.value != null);
          if (valid.length === 0) return '';
          let html = `<div style="font-weight:600;margin-bottom:4px;">${valid[0].name}</div>`;
          valid.forEach((p: any) => {
            const val = Number(p.value).toFixed(2);
            if (p.seriesName === '套利空间') {
              const color = Number(p.value) >= 0 ? '#f23645' : '#089981';
              html += `<div style="display:flex;justify-content:space-between;width:180px;">
                        <span style="color:#787b86">${p.seriesName}</span>
                        <span style="font-weight:600;color:${color}">${val} <span style="font-size:10px;color:#787b86">元/MWh</span></span>
                       </div>`;
            } else {
              html += `<div style="display:flex;justify-content:space-between;width:180px;">
                        <span style="color:${p.color}">${p.seriesName}</span>
                        <span style="font-weight:600">${val} <span style="font-size:10px;color:#787b86">元/MWh</span></span>
                       </div>`;
            }
          });
          return html;
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        lineStyle: { color: '#787b86', type: 'dashed', width: 1 }
      },
      legend: {
        data: ['日前结算价差', '加权交易均价差'],
        top: 4, right: 10,
        textStyle: { fontSize: 11 },
        icon: 'roundRect', itemWidth: 14, itemHeight: 3
      },
      grid: [
        { top: 35, height: '40%', left: 60, right: 20, containLabel: true },
        { top: '54%', height: '40%', left: 60, right: 20, containLabel: true }
      ],
      xAxis: [
        { gridIndex: 0, type: 'category', data: dates, boundaryGap: true, axisTick: { alignWithLabel: true }, axisLabel: { fontSize: 10, interval: intervalStep, formatter: (val: string) => (val && val.length >= 10 ? val.slice(5) : val) } },
        { gridIndex: 1, type: 'category', data: dates, boundaryGap: true, axisTick: { alignWithLabel: true }, axisLabel: { fontSize: 10, interval: intervalStep, formatter: (val: string) => (val && val.length >= 10 ? val.slice(5) : val) } }
      ],
      yAxis: [
        { gridIndex: 0, type: 'value', name: '元/MWh', nameGap: 8, nameTextStyle: { color: '#787b86', fontSize: 10, align: 'left' }, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLabel: { fontSize: 10 } },
        { gridIndex: 1, type: 'value', name: '元/MWh', nameGap: 8, nameTextStyle: { color: '#787b86', fontSize: 10, align: 'left' }, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLabel: { fontSize: 10 } }
      ],
      series: [
        { name: '日前结算价差', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: da, itemStyle: { color: '#2962ff' }, lineStyle: { width: 2 }, symbol: 'none' },
        { name: '加权交易均价差', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: rt, itemStyle: { color: '#e91e63' }, lineStyle: { width: 2 }, symbol: 'none' },
        { name: '套利空间', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: spaces, itemStyle: { color: (params: any) => params.value > 0 ? '#f23645' : '#089981' } }
      ]
    };
  };

  const buildArbitrageHeatmap = () => {
    const { heatmapData } = getArbitrageData();
    if (!heatmapData.length) return {};
    
    const hours = Array.from({length: 24}, (_, i) => String(i + 1));
    
    const values = heatmapData.map(d => d[2]);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal));

    return {
      title: {
        text: '统一结算点日前价格(结算) 24时段套利均价差热力图',
        left: 4,
        top: 0,
        textStyle: { color: '#131722', fontSize: 16, fontWeight: 700 }
      },
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(19, 23, 34, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: any) => {
          const buy = p.value[0] + 1;
          const sell = p.value[1] + 1;
          const spread = p.value[2].toFixed(2);
          const color = p.value[2] >= 0 ? '#ff8a93' : '#5adbb5';
          return `<div style="font-weight:600;margin-bottom:4px;">买入: ${buy}:00 &nbsp;→&nbsp; 卖出: ${sell}:00</div>` +
                 `均价差: <b style="color:${color}">${spread}</b> 元`;
        }
      },
      grid: { top: 34, right: 42, left: 46, bottom: 42 },
      xAxis: {
        type: 'category', data: hours, name: '买入时段',
        nameLocation: 'middle', nameGap: 26,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 600 },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, interval: 0, color: '#4b5563', hideOverlap: false }
      },
      yAxis: {
        type: 'category', data: hours, name: '卖出时段',
        nameLocation: 'middle', nameGap: 28,
        nameTextStyle: { color: '#787b86', fontSize: 12, fontWeight: 600 },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, interval: 0, color: '#4b5563' }
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: true,
        orient: 'vertical',
        right: 2,
        top: 'center',
        itemWidth: 14,
        itemHeight: 160,
        precision: 0,
        textStyle: { color: '#4b5563', fontSize: 11 },
        inRange: { color: ['#0a8a6d', '#5cc9a7', '#f7f8fa', '#f88d97', '#e5263b'] }
      },
      series: [
        {
          type: 'heatmap',
          data: heatmapData,
          label: { show: false },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1.5 },
          emphasis: {
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0, 0, 0, 0.45)', borderColor: '#131722', borderWidth: 1.5 },
            scaleSize: 4
          }
        },
        {
          name: '当前选中',
          type: 'scatter',
          data: [[selectedArbitragePair[0] - 1, selectedArbitragePair[1] - 1]],
          symbolSize: 16,
          itemStyle: { color: 'rgba(41, 98, 255, 0.12)', borderColor: '#2962ff', borderWidth: 2.5 },
          silent: true,
          z: 3
        }
      ]
    };
  };

  const buildArbitrageTrend = () => {
    const { trendData } = getArbitrageData();
    if (!trendData.length) return {};
    return {
      title: { text: `选中组合 (${selectedArbitragePair[0]}:00 买入, ${selectedArbitragePair[1]}:00 卖出) 每日结算价差`, left: 8, top: 4, textStyle: { fontSize: 12 } },
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>价差: <b>${p[0].value.toFixed(2)}</b> 元` },
      grid: { left: 40, right: 20, top: 30, bottom: 20 },
      xAxis: { type: 'category', data: trendData.map((d: any) => d.date) },
      yAxis: { type: 'value', splitLine: { show: false } },
      series: [{
        type: 'bar',
        data: trendData.map((d: any) => ({
          value: d.spread,
          itemStyle: { color: d.spread >= 0 ? '#f23645' : '#089981' }
        }))
      }]
    };
  };

  const buildArbitrageHistogram = () => {
    const { histData } = getArbitrageData();
    if (!histData.length) return {};
    return {
      title: { text: '结算价差概率分布', left: 8, top: 4, textStyle: { fontSize: 12 } },
      tooltip: { 
        trigger: 'axis', 
        formatter: (params: any) => {
          const p = params[0];
          const binIndex = p.dataIndex;
          let countLess = 0;
          let countGreater = 0;
          for(let i=0; i<histData.length; i++) {
            if(i < binIndex) countLess += histData[i].count;
            if(i > binIndex) countGreater += histData[i].count;
          }
          const totalCount = histData.reduce((acc: any, d: any) => acc + d.count, 0);
          const probLess = totalCount ? ((countLess / totalCount) * 100).toFixed(1) : 0;
          const probGreater = totalCount ? ((countGreater / totalCount) * 100).toFixed(1) : 0;
          const probSelf = totalCount ? ((p.value / totalCount) * 100).toFixed(1) : 0;
          return `区间: ${p.name}<br/>频次: <b>${p.value}</b> 天 (${probSelf}%)<br/>` +
                 `<span style="color:#089981">小于该区间概率: <b>${probLess}%</b></span><br/>` +
                 `<span style="color:#f23645">大于该区间概率: <b>${probGreater}%</b></span>`;
        } 
      },
      grid: { left: 40, right: 20, top: 30, bottom: 20 },
      xAxis: { type: 'category', data: histData.map((d: any) => d.range), axisLabel: { fontSize: 9, rotate: 45 } },
      yAxis: { type: 'value', splitLine: { show: false } },
      series: [{
        type: 'bar',
        data: histData.map((d: any) => ({
          value: d.count,
          itemStyle: { color: d.binStart >= 0 ? 'rgba(242,54,69,0.7)' : 'rgba(8,153,129,0.7)' }
        }))
      }]
    };
  };

  
  // ===============================
  // Page 7: Strategy Spread (Formula: 日前 - 现货)
  // ===============================
  const strategyFilteredData = useMemo(() => {
    if (!data || !data.rolling) return [];
    let minDate = data.meta.date_range.start;
    let maxDate = selectedDate || data.meta.date_range.end;
    if (dateRange === 'Custom' && customDateStart && customDateEnd) {
      minDate = customDateStart;
      maxDate = customDateEnd;
    } else if (dateRange !== 'All' && selectedDate) {
      const maxDateObj = new Date(selectedDate);
      let days = 30;
      switch (dateRange) {
        case '1D': days = 1; break;
        case '5D': days = 5; break;
        case '1M': days = 30; break;
        case '3M': days = 90; break;
        case '6M': days = 180; break;
        case '1Y': days = 365; break;
        case '5Y': days = 1825; break;
        default: days = 30;
      }
      minDate = new Date(maxDateObj.getTime() - (days - 1) * 24 * 3600 * 1000).toISOString().split('T')[0];
    }
    return data.rolling.filter(r => r.target_date && r.target_date >= minDate && r.target_date <= maxDate);
  }, [data, dateRange, selectedDate, customDateStart, customDateEnd]);

  const strategySpreadData = useMemo(() => {
    if (!strategyFilteredData || strategyFilteredData.length === 0) return [];
    
    const daByDate: Record<string, Record<number, number>> = {};
    const wtByDate: Record<string, Record<number, number>> = {};
    
    strategyFilteredData.forEach((r: any) => {
      const d = r.target_date;
      const p = r.period;
      if (r.day_ahead_price !== null && r.day_ahead_price !== undefined) {
        if (!daByDate[d]) daByDate[d] = {};
        daByDate[d][p] = r.day_ahead_price;
      }
      const wtPrice = (r.day_ahead_price || 0) + (r.spread || 0);
      if (!wtByDate[d]) wtByDate[d] = {};
      wtByDate[d][p] = wtPrice;
    });
    
    const dates = Object.keys(daByDate).sort((a,b) => a.localeCompare(b));
    const result = [];
    
    for (const d of dates) {
      if (wtByDate[d]) {
        const daA = daByDate[d][strategySpreadPointA];
        const daB = daByDate[d][strategySpreadPointB];
        const wtA = wtByDate[d][strategySpreadPointA];
        const wtB = wtByDate[d][strategySpreadPointB];
        
        if (daA !== undefined && daB !== undefined && wtA !== undefined && wtB !== undefined) {
          const daSpread = daB - daA; // 时段B - 时段A
          const rtSpread = wtB - wtA; // 时段B - 时段A
          const space = daSpread - rtSpread; // 日前结算价差 - 加权交易均价差
          result.push({ date: d, daSpread, rtSpread, space });
        }
      }
    }
    return result;
  }, [strategyFilteredData, strategySpreadPointA, strategySpreadPointB]);

  const strategyScannerData = useMemo(() => {
    if (!strategyFilteredData || strategyFilteredData.length === 0) return [];
    const daByDate: Record<string, Record<number, number>> = {};
    const wtByDate: Record<string, Record<number, number>> = {};
    
    strategyFilteredData.forEach((r: any) => {
      const d = r.target_date;
      const p = r.period;
      if (r.day_ahead_price !== null && r.day_ahead_price !== undefined) {
        if (!daByDate[d]) daByDate[d] = {};
        daByDate[d][p] = r.day_ahead_price;
      }
      const wtPrice = (r.day_ahead_price || 0) + (r.spread || 0);
      if (!wtByDate[d]) wtByDate[d] = {};
      wtByDate[d][p] = wtPrice;
    });
    
    const dates = Object.keys(daByDate);
    const matrix = [];
    
    for (let a = 1; a <= 24; a++) {
      for (let b = 1; b <= 24; b++) {
        let totalSpace = 0;
        let count = 0;
        for (const d of dates) {
          if (wtByDate[d]) {
            const daA = daByDate[d][a];
            const daB = daByDate[d][b];
            const wtA = wtByDate[d][a];
            const wtB = wtByDate[d][b];
            if (daA !== undefined && daB !== undefined && wtA !== undefined && wtB !== undefined) {
              const daSpread = daB - daA; // 时段B - 时段A
              const rtSpread = wtB - wtA; // 时段B - 时段A
              totalSpace += (daSpread - rtSpread); // 日前结算价差 - 加权交易均价差
              count++;
            }
          }
        }
        matrix.push([a - 1, b - 1, count > 0 ? totalSpace / count : 0]);
      }
    }
    return matrix;
  }, [strategyFilteredData]);

// ===== LOADING / ERROR =====
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#2962ff', marginBottom: 8 }}>⚡ PowerTradingView</div>
        <div style={{ color: '#787b86' }}>正在加载历史数据...</div>
      </div>
    </div>
  );
  if (error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ textAlign: 'center', color: '#f23645' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>数据加载失败</div>
        <div>{error}</div>
        <div style={{ color: '#787b86', marginTop: 8, fontSize: 13 }}>请先运行 <code>python scripts/parse_data.py</code></div>
      </div>
    </div>
  );

  // ===== WATCHLIST ITEMS =====
  const watchlistItems = [
    { abbr: 'FH', bg: '#f23645', name: '系统负荷', key: 'load' },
    { abbr: 'LL', bg: '#787b86', name: '联络线', key: 'interconnect' },
    { abbr: 'FD', bg: '#089981', name: '风电出力', key: 'wind' },
    { abbr: 'GF', bg: '#f59e0b', name: '光伏出力', key: 'solar' },
    { abbr: 'SD', bg: '#2962ff', name: '水电出力', key: 'hydro' },
  ];



  // ===============================
  // Page 6: Rolling Opportunities
  // ===============================

  const buildRollingHeatmap = () => {
    if (!data || !filteredRollingData || filteredRollingData.length === 0) return {};
    
    const dates = Array.from(new Set(filteredRollingData.map((r: any) => r.target_date))).sort();
    const periods = Array.from({length: 24}, (_, i) => i + 1);
    
    const heatData = [];
    let maxAbs = 0;
    const spreads: number[] = [];
    for(let d=0; d<dates.length; d++) {
        for(let p=0; p<periods.length; p++) {
            const r = filteredRollingData.find((x: any) => x.target_date === dates[d] && x.period === periods[p]);
            if(r) {
                const da = r.day_ahead_price != null ? r.day_ahead_price : null;
                const wt = da != null && r.spread != null ? da + r.spread : null;
                heatData.push({ value: [p, d, r.spread], da, wt });
                spreads.push(Math.abs(r.spread));
            }
        }
    }
    spreads.sort((a, b) => a - b);
    maxAbs = spreads.length > 0 ? spreads[Math.floor(spreads.length * 0.9)] : 50;
    if (maxAbs < 10) maxAbs = 10; // ensure a minimum gradient
    
    return {
      title: { text: '日滚动交易机会(D+2) 价差热力图', left: 8, top: 0, textStyle: { color: '#131722', fontSize: 14 } },
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const da = p.data.da;
          const wt = p.data.wt;
          return `标的日期: ${dates[p.data.value[1]]}<br/>时段: ${periods[p.data.value[0]]}:00<br/>` +
            `日前价格: <b>${da != null ? da.toFixed(2) : '-'}</b> 元/MWh<br/>` +
            `加权价格: <b>${wt != null ? wt.toFixed(2) : '-'}</b> 元/MWh<br/>` +
            `交易机会价差: <b>${p.data.value[2].toFixed(2)}</b> 元/MWh`;
        }
      },
      grid: { top: 40, height: dates.length * 25, left: 80, right: 80 },
      xAxis: {
        type: 'category',
        data: periods.map(p => String(p)),
        splitArea: { show: true },
        axisLabel: { interval: 0 }
      },
      yAxis: { type: 'category', data: dates, splitArea: { show: true }, inverse: true },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        text: ['卖出', '买入'],
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'center',
        inRange: { color: ['#089981', '#ffffff', '#f23645'] }
      },
      animation: false,
      series: [{
        type: 'heatmap',
        data: heatData,
        label: { show: true, fontSize: 10, formatter: (p: any) => p.data.value[2].toFixed(2) },
        itemStyle: { borderWidth: 1, borderColor: '#f3f4f6' },
        emphasis: { disabled: true }
      }]
    };
  };

  const buildRollingVolatilityChart = () => {
    if (!data || !filteredRollingData || filteredRollingData.length === 0) return {};
    const filtered = filteredRollingData.filter((r: any) => r.period === selectedRollingPeriod).sort((a: any, b: any) => a.target_date.localeCompare(b.target_date));
    if(!filtered.length) return {};
    
    return {
      title: { text: `时段 ${selectedRollingPeriod}:00 交易机会与流动性`, left: 8, top: 4, textStyle: { fontSize: 12 } },
      tooltip: { 
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: { data: ['加权价差', '极值区间', '成交量'], top: 25 },
      grid: { left: 50, right: 50, top: 60, bottom: 30 },
      xAxis: { type: 'category', data: filtered.map((d: any) => d.target_date) },
      yAxis: [
        { type: 'value', name: '价差(元/MWh)', position: 'left', splitLine: { show: true, lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
        { type: 'value', name: '成交量(MWh)', position: 'right', splitLine: { show: false } }
      ],
      series: [
        {
          name: '加权价差',
          type: 'line',
          data: filtered.map((d: any) => d.spread),
          itemStyle: { color: '#2962FF' },
          lineStyle: { width: 2 },
          symbol: 'circle',
          symbolSize: 6,
          yAxisIndex: 0,
          z: 3
        },
        {
          name: '极值区间',
          type: 'custom',
          renderItem: function (_params: any, api: any) {
            var xValue = api.value(0);
            var highPoint = api.coord([xValue, api.value(1)]);
            var lowPoint = api.coord([xValue, api.value(2)]);
            var halfWidth = api.size([1, 0])[0] * 0.1;
            var style = api.style({ stroke: api.visual('color'), fill: 'transparent' });
            return {
              type: 'group',
              children: [
                { type: 'line', transition: ['shape'], shape: { x1: highPoint[0] - halfWidth, y1: highPoint[1], x2: highPoint[0] + halfWidth, y2: highPoint[1] }, style: style },
                { type: 'line', transition: ['shape'], shape: { x1: highPoint[0], y1: highPoint[1], x2: lowPoint[0], y2: lowPoint[1] }, style: style },
                { type: 'line', transition: ['shape'], shape: { x1: lowPoint[0] - halfWidth, y1: lowPoint[1], x2: lowPoint[0] + halfWidth, y2: lowPoint[1] }, style: style }
              ]
            };
          },
          encode: { x: 0, y: [1, 2] },
          data: filtered.map((d: any) => {
            const h = d.max_price != null && d.day_ahead_price != null ? d.max_price - d.day_ahead_price : d.spread;
            const l = d.min_price != null && d.day_ahead_price != null ? d.min_price - d.day_ahead_price : d.spread;
            return [d.target_date, h, l];
          }),
          itemStyle: { color: '#FF9800' },
          yAxisIndex: 0,
          z: 2
        },
        {
          name: '成交量',
          type: 'bar',
          data: filtered.map((d: any) => d.volume),
          itemStyle: { color: 'rgba(41, 98, 255, 0.2)' },
          yAxisIndex: 1,
          z: 1
        }
      ]
    };
  };

  const buildRollingScatterChart = () => {
    if (!data || !filteredRollingData || filteredRollingData.length === 0) return {};
    return {
      title: { text: '全时段 成交量 vs 价差分布', left: 8, top: 4, textStyle: { fontSize: 12 } },
      tooltip: { 
        trigger: 'item',
        formatter: (p: any) => `日期: ${p.data[2]}<br/>时段: ${p.data[3]}:00<br/>成交量: ${p.data[0]}<br/>价差: ${p.data[1].toFixed(2)}`
      },
      grid: { left: 50, right: 30, top: 40, bottom: 40 },
      xAxis: { type: 'value', name: '成交量(MWh)', nameLocation: 'middle', nameGap: 25, splitLine: { show: false } },
      yAxis: { type: 'value', name: '价差(元/MWh)', splitLine: { show: true, lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
      visualMap: {
        show: false,
        dimension: 1,
        pieces: [
          { min: 0, color: '#f23645' },
          { max: 0, color: '#089981' }
        ]
      },
      series: [{
        type: 'scatter',
        symbolSize: 5,
        itemStyle: { opacity: 0.6 },
        data: filteredRollingData.map((r: any) => [r.volume, r.spread, r.target_date, r.period])
      }]
    };
  };

  // ===== RENDER =====
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* TOP TOOLBAR */}
      <div className="tv-toolbar">
        <div className="tv-toolbar-left">
          <button className="tv-toolbar-btn" style={{ fontSize: 16 }}>☰</button>
          <div className="tv-toolbar-sep" />
          <button className="tv-toolbar-btn symbol">
            <span style={{ color: '#2962ff', fontSize: 18, marginRight: 2 }}>⚡</span>GS_POWER
          </button>
          <div className="tv-toolbar-sep" />

          {/* Page tabs */}
          {PAGE_BTNS.map(p => (
            <button key={p.key}
              className={`tv-toolbar-btn${page === p.key ? ' active-scale' : ''}`}
              onClick={() => setPage(p.key)}
              style={page === p.key ? { color: '#2962ff', fontWeight: 700, borderBottom: '2px solid #2962ff' } : {}}>
              {p.label}
            </button>
          ))}
          <div className="tv-toolbar-sep" />



          {/* Page 1 only: view toggle */}
          {page === 'page1' && (
            <>
              <div className="tv-toolbar-sep" />
              <button className={`tv-toolbar-btn${activeView === 'overview' ? ' active-scale' : ''}`}
                onClick={() => setActiveView('overview')}
                style={activeView === 'overview' ? { color: '#2962ff', fontWeight: 600 } : {}}>总览</button>
              <button className={`tv-toolbar-btn${activeView === 'detail' ? ' active-scale' : ''}`}
                onClick={() => setActiveView('detail')}
                style={activeView === 'detail' ? { color: '#2962ff', fontWeight: 600 } : {}}>单日详情</button>
            </>
          )}
        </div>
        <div className="tv-toolbar-right">
          {data && <span style={{ fontSize: 11, color: '#787b86', marginRight: 8 }}>{data.meta.date_range.start} ~ {data.meta.date_range.end}</span>}
          <button className="tv-toolbar-btn publish">发布策略</button>
        </div>
      </div>

      {/* MAIN BODY */}
      <div className="tv-main">
        {/* LEFT SIDEBAR */}
        <div className="tv-left-sidebar">
          <button className="tv-left-btn active">+</button>
          <div className="tv-left-sep" />
          <button className="tv-left-btn">╲</button>
          <button className="tv-left-btn">⊿</button>
          <button className="tv-left-btn">〰</button>
          <button className="tv-left-btn">▭</button>
          <button className="tv-left-btn">↔</button>
          <div className="tv-left-sep" />
          <button className="tv-left-btn">T</button>
          <button className="tv-left-btn">⊕</button>
          <button className="tv-left-btn">🔒</button>
        </div>

        {/* CENTER CHART AREA (hidden on page7 — the strategy page renders full-width below) */}
        <div className="tv-chart-area" style={page === 'page7' ? { display: 'none' } : undefined}>
          {/* ===== PAGE 1: OVERVIEW ===== */}
          {page === 'page1' && activeView === 'overview' && (
            <>

              <div style={{ height: '60%', paddingTop: 4 }}>
                <ReactECharts option={buildOverviewChart()} style={{ height: '100%' }} onEvents={{ legendselectchanged: (p: any) => handleLegendSelect('overview', p) }} onChartReady={(c: any) => c.group = 'sync-overview'} notMerge />
              </div>
              <div style={{ height: '40%', borderTop: '1px solid #e0e3eb' }}>
                <ReactECharts option={buildPriceChart()} style={{ height: '100%' }} onEvents={{ legendselectchanged: (p: any) => handleLegendSelect('price', p) }} onChartReady={(c: any) => c.group = 'sync-overview'} notMerge />
              </div>
            </>
          )}

          {page === 'page1' && activeView === 'detail' && (
            <>

              <div style={{ position: 'absolute', top: 8, right: 64, zIndex: 10 }}>
                <select value={selectedDate || ''} onChange={e => setSelectedDate(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #e0e3eb', borderRadius: 4, background: '#fff', color: '#131722' }}>
                  {availableDates.slice(-60).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ height: '100%', paddingTop: 4 }}>
                <ReactECharts option={buildDayChart()} style={{ height: '100%' }} onEvents={{ legendselectchanged: (p: any) => handleLegendSelect('day', p) }} notMerge />
              </div>
            </>
          )}

          {/* ===== PAGE 2: WEATHER — TWO-DAY COMPARE / CORRELATION ===== */}
          {page === 'page2' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', gap: '10px', boxSizing: 'border-box', background: '#f5f7fa' }}>

              {/* TOP BAR: title + date pickers + tab switch */}
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '4px 16px' }}>
                <span style={{ fontWeight: 700, color: '#131722', fontSize: '15px' }}>气象相关性</span>
                <div style={{ width: '1px', height: '20px', background: '#e0e3eb' }} />
                {(page2Tab === 'compare' || page2Tab === 'hedong') && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f5f7fa', border: '1px solid #e0e3eb', borderRadius: '8px', padding: '2px 8px' }}>
                      <span style={{ color: '#787b86', fontSize: '12px' }}>日期A</span>
                      <input type="date" value={cmpDateA} onChange={e => setCompareDateA(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#131722', cursor: 'pointer' }} />
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 600 }}>VS</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f5f7fa', border: '1px solid #e0e3eb', borderRadius: '8px', padding: '2px 8px' }}>
                      <span style={{ color: '#787b86', fontSize: '12px' }}>日期B</span>
                      <input type="date" value={cmpDateB} onChange={e => setCompareDateB(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#131722', cursor: 'pointer' }} />
                    </div>
                  </>
                )}
                {(page2Tab === 'timeseries' || page2Tab === 'correlation') && (
                  <div style={{ display: 'flex', gap: '2px', background: '#f0f3fa', borderRadius: '8px', padding: '3px' }}>
                    {([['wind', '风电 vs 风速'], ['solar', '光伏 vs 辐射'], ['load', '负荷 vs 温度'], ['hydro', '水电 vs 降水']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setWeatherMetric(id)}
                        style={{
                          padding: '4px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                          fontWeight: weatherMetric === id ? 600 : 400,
                          background: weatherMetric === id ? '#fff' : 'transparent',
                          color: weatherMetric === id ? '#2962ff' : '#787b86',
                          boxShadow: weatherMetric === id ? '0 1px 3px rgba(19,23,34,0.1)' : 'none'
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px', background: '#f0f3fa', borderRadius: '8px', padding: '2px' }}>
                  {([['compare', '两日对比'], ['hedong', '河东对比'], ['timeseries', '出力与气象时序'], ['correlation', '相关性分析']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setPage2Tab(id)}
                      style={{
                        padding: '3px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                        fontWeight: page2Tab === id ? 600 : 400,
                        background: page2Tab === id ? '#fff' : 'transparent',
                        color: page2Tab === id ? '#2962ff' : '#787b86',
                        boxShadow: page2Tab === id ? '0 1px 3px rgba(19,23,34,0.1)' : 'none'
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB 1: TWO-DAY COMPARISON (scrollable — charts get fixed, comfortable heights) */}
              {page2Tab === 'compare' && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  {/* 2x2 grid: wind / radiation / temperature + price */}
                  <div style={{ height: '560px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px' }}>
                    {WEATHER_COMPARE_ITEMS.slice(0, 3).map(renderWeatherCompareCard)}
                    {renderPriceCompareCard()}
                  </div>

                  {/* Row 3: bidding space + interconnect compare — same width as wind/temp cards */}
                  <div style={{ height: '280px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {renderWeatherCompareCard(BIDDING_SPACE_ITEM)}
                    {renderWeatherCompareCard(INTERCONNECT_ITEM)}
                  </div>

                  {/* Row 4: weather/output time series — full width */}
                  <div style={{ height: '280px', flexShrink: 0, display: 'flex', gap: '10px' }}>
                    {renderTimeSeriesCard()}
                  </div>

                  {/* Row 5 (last): rainfall compare — left half width */}
                  <div style={{ height: '280px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {renderWeatherCompareCard(WEATHER_COMPARE_ITEMS[3])}
                  </div>
                </div>
              )}

              {/* TAB: HEDONG TWO-DAY COMPARISON (2x3 grid: weather w/ output bars + load + price + time series) */}
              {page2Tab === 'hedong' && (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ height: '840px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', gap: '10px' }}>
                    {HEDONG_COMPARE_ITEMS.map(renderWeatherCompareCard)}
                    {renderWeatherCompareCard(HEDONG_LOAD_ITEM)}
                    {renderPriceCompareCard()}
                    {renderTimeSeriesCard()}
                  </div>
                </div>
              )}

              {/* TAB 2: OUTPUT vs WEATHER TIME SERIES (full width) */}
              {page2Tab === 'timeseries' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                    <ReactECharts option={buildWeatherTimeSeriesChart(...WEATHER_TS_CFG[weatherMetric].ts)} style={{ height: '100%', width: '100%' }} notMerge />
                  </div>
                </div>
              )}

              {/* TAB 3: CORRELATION (scatter) */}
              {page2Tab === 'correlation' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                    <ReactECharts option={buildScatterChart(...WEATHER_TS_CFG[weatherMetric].scatter)} style={{ height: '100%', width: '100%' }} notMerge />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== PAGE 8: CONGESTION ANALYSIS ===== */}
          {page === 'page8' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', gap: '10px', boxSizing: 'border-box', background: '#f5f7fa', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '6px 16px' }}>
                <span style={{ fontWeight: 700, color: '#131722', fontSize: '15px' }}>阻塞分析</span>
                <div style={{ width: '1px', height: '20px', background: '#e0e3eb' }} />
                {!nodeData && <span style={{ fontSize: '12px', color: '#f23645' }}>未找到 nodes.json，请先运行数据解析脚本</span>}
                {nodeData && (
                  <div style={{ position: 'relative' }}>
                    <input
                      value={nodeSearch}
                      onChange={e => setNodeSearch(e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder={selectedNode}
                      style={{ width: '280px', padding: '4px 10px', fontSize: '12px', border: '1px solid #e0e3eb', borderRadius: '6px', outline: 'none', color: '#131722' }}
                    />
                    {nodeSearch && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, width: '340px', maxHeight: '260px', overflowY: 'auto', background: '#fff', border: '1px solid #e0e3eb', borderRadius: '8px', boxShadow: '0 4px 16px rgba(19,23,34,0.12)', marginTop: 4 }}>
                        {nodeData.nodes.filter(n => n.toLowerCase().includes(nodeSearch.toLowerCase())).slice(0, 50).map(n => (
                          <div key={n}
                            onMouseDown={() => { setSelectedNode(n); setNodeSearch(''); }}
                            style={{ padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: n === selectedNode ? '#2962ff' : '#4b5563', fontWeight: n === selectedNode ? 600 : 400, background: n === selectedNode ? '#f0f3fa' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f7fa')}
                            onMouseLeave={e => (e.currentTarget.style.background = n === selectedNode ? '#f0f3fa' : 'transparent')}>
                            {n}
                          </div>
                        ))}
                        {nodeData.nodes.filter(n => n.toLowerCase().includes(nodeSearch.toLowerCase())).length === 0 &&
                          <div style={{ padding: '8px 12px', fontSize: '12px', color: '#9ca3af' }}>无匹配节点</div>}
                      </div>
                    )}
                  </div>
                )}
                {nodeStats && (
                  <div style={{ display: 'flex', gap: '18px', fontSize: '12px', color: '#787b86', marginLeft: 'auto' }}>
                    <span>平均价差 <b style={{ color: nodeStats.avg >= 0 ? '#f23645' : '#089981', fontSize: '14px' }}>{nodeStats.avg >= 0 ? '+' : ''}{nodeStats.avg.toFixed(2)}</b> 元/MWh</span>
                    <span>最大价差 <b style={{ color: '#f23645', fontSize: '14px' }}>+{nodeStats.max.toFixed(2)}</b> <span style={{ fontSize: '11px' }}>({nodeStats.maxTime})</span></span>
                    <span>阻塞频率 <b style={{ color: '#131722', fontSize: '14px' }}>{nodeStats.freq.toFixed(1)}%</b></span>
                  </div>
                )}
              </div>

              {nodeData && (
                <>
                  {/* Chart 1: node price vs unified price + spread bars */}
                  <div style={{ height: '380px', flexShrink: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722', flexShrink: 0 }}>
                      {selectedNode} <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>节点价 vs 统一结算价 · 价差=节点价−统一价，越高阻塞越严重</span>
                    </span>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <ReactECharts option={buildNodeCompareChart()} style={{ height: '100%', width: '100%' }} notMerge />
                    </div>
                  </div>

                  {/* Daily evolution: date x 24h heatmap + per-hour trend (linked) */}
                  <div style={{ height: '380px', flexShrink: 0, display: 'flex', gap: '10px' }}>
                    <div style={{ flex: '0 0 46%', minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722', flexShrink: 0 }}>逐日分时热力图 <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>日期×24时段 · 点击格子将小时加入右侧趋势</span></span>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <ReactECharts option={buildNodeDailyHeatmap()} style={{ height: '100%', width: '100%' }} notMerge
                          onEvents={{ click: (p: any) => { if (p.value) toggleHour(p.value[0] + 1); } }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722' }}>分时逐日趋势 <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>虚线=7日均线 · Ctrl多选 · Shift连选</span></span>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#787b86' }}>
                          {hourEvolutionStats.map(s => (
                            <span key={s.hour}>
                              {s.hour}时: {s.firstAvg != null ? s.firstAvg.toFixed(1) : '-'} → {s.lastAvg != null ? s.lastAvg.toFixed(1) : '-'}
                              {s.delta != null && <b style={{ color: s.delta <= 0 ? '#089981' : '#f23645' }}> ({s.delta <= 0 ? '缓解' : '恶化'}{Math.abs(s.delta).toFixed(1)})</b>}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', padding: '6px 0 2px', flexShrink: 0 }}>
                        {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                          <button key={h} onClick={(e) => handleNodeHourClick(h, e)}
                            style={{
                              padding: '1px 6px', fontSize: '10px', borderRadius: '10px', cursor: 'pointer',
                              border: selectedHours.includes(h) ? 'none' : '1px solid #e0e3eb',
                              background: selectedHours.includes(h) ? '#131722' : '#f3f4f6',
                              color: selectedHours.includes(h) ? '#fff' : '#4b5563'
                            }}>
                            {h}
                          </button>
                        ))}
                      </div>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <ReactECharts option={buildNodeHourTrendChart()} style={{ height: '100%', width: '100%' }} notMerge />
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: ranking + heatmap */}
                  <div style={{ height: '380px', flexShrink: 0, display: 'flex', gap: '10px' }}>
                    <div style={{ flex: '0 0 42%', minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722', flexShrink: 0 }}>节点平均价差排行 <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>TOP 20 · 点击切换节点</span></span>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <ReactECharts option={buildNodeRankChart()} style={{ height: '100%', width: '100%' }} notMerge
                          onEvents={{ click: (p: any) => { if (p.name) setSelectedNode(p.name); } }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px 12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#131722', flexShrink: 0 }}>节点×小时 价差热力图 <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>价差最大的30个节点 · 红=正价差(阻塞)</span></span>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <ReactECharts option={buildNodeHeatmap()} style={{ height: '100%', width: '100%' }} notMerge />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== PAGE 3: BIDDING SPACE ===== */}
          {page === 'page3' && (
            <div style={{ display: 'flex', flexDirection: 'row', height: '100%', padding: '8px', gap: '12px', boxSizing: 'border-box' }}>
              {/* Sidebar Pill Control Toolbar */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                width: '200px',
                flexShrink: 0,
                gap: '12px',
                padding: '16px',
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e3eb',
                boxSizing: 'border-box',
                overflowY: 'auto',
                ...(timeScale !== 'hourly' ? { opacity: 0.4, pointerEvents: 'none' as const } : {})
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#131722', marginBottom: '4px' }}>时段筛选</div>
                {timeScale !== 'hourly' && <div style={{ fontSize: '11px', color: '#9ca3af' }}>仅"24时段"模式下可用</div>}
                {/* "All" Pill */}
                <button
                  onClick={() => { setSelectedBiddingHours([]); setLastClickedHour(null); }}
                  style={{
                    padding: '6px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '20px',
                    border: 'none',
                    background: selectedBiddingHours.length === 0 ? '#131722' : '#f3f4f6',
                    color: selectedBiddingHours.length === 0 ? '#ffffff' : '#374151',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  全部
                </button>

                {/* 24 Hour Circular Pills Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const h = i + 1;
                    const isSelected = selectedBiddingHours.includes(h);
                    const hourColor = HOUR_COLORS_24[i];

                    return (
                      <button
                        key={h}
                        onClick={(e) => handleHourClick(h, e)}
                        style={{
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          fontSize: '12px',
                          fontWeight: 500,
                          border: isSelected ? '1px solid transparent' : '1px solid #e5e7eb',
                          background: isSelected ? hourColor : '#ffffff',
                          color: isSelected ? '#ffffff' : '#374151',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          padding: 0
                        }}
                      >
                        {String(h).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>

                <div style={{ height: '1px', background: '#e0e3eb', margin: '4px 0' }} />
                <div style={{ fontSize: '12px', color: '#787b86', marginBottom: '2px' }}>着色方式</div>
                <div style={{ display: 'flex', gap: '4px', background: '#f0f3fa', borderRadius: '8px', padding: '3px' }}>
                  {([['hour', '按时段'], ['price', '按价格'], ['date', '按日期']] as const).map(([mode, label]) => {
                    const disabled = mode === 'hour' && timeScale !== 'hourly';
                    const active = colorMode === mode;
                    return (
                      <button key={mode}
                        disabled={disabled}
                        onClick={() => setColorMode(mode)}
                        style={{
                          flex: 1, padding: '4px 0', fontSize: '12px', border: 'none', borderRadius: '6px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          fontWeight: active ? 600 : 400,
                          background: active ? '#fff' : 'transparent',
                          color: disabled ? '#c3c9d4' : active ? '#2962ff' : '#787b86',
                          boxShadow: active ? '0 1px 3px rgba(19,23,34,0.1)' : 'none'
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chart container */}
              <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '8px', border: '1px solid #e0e3eb', padding: '8px' }}>
                <ReactECharts 
                  option={buildBiddingChart()} 
                  style={{ height: '100%', width: '100%' }} 
                  onEvents={{ legendselectchanged: (p: any) => handleLegendSelect('bidding', p) }} 
                  notMerge 
                />
              </div>
            </div>
          )}

          {/* ===== PAGE 4: SPOT PRICE COMPARISON ===== */}
          {page === 'page4' && (
            <>
              <div style={{ height: '100%', paddingTop: 4 }}>
                <ReactECharts option={buildPriceComparisonChart()} style={{ height: '100%' }} onEvents={{ legendselectchanged: (p: any) => handleLegendSelect('compare', p) }} notMerge />
              </div>
            </>
          )}
          {/* ===== PAGE 5: ARBITRAGE ANALYSIS ===== */}
          {page === 'page6' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', overflowY: 'auto', padding: '16px' }}>
            <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '16px', minHeight: '400px', height: Math.max(rollingDatesCount * 25 + 132, 400) + 'px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <ReactECharts 
                option={buildRollingHeatmap()} 
                style={{ height: '100%', width: '100%' }} 
                notMerge={false} 
                onEvents={{
                  click: (params: any) => {
                    if (params.componentType === 'series') {
                      setSelectedRollingPeriod(params.value[0] + 1);
                    }
                  }
                }}
              />
              <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>提示: 点击热力图中的色块，即可在下方查看对应时段的深度剖析</div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', height: '600px', flexShrink: 0 }}>
              <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '16px', flex: 1 }}>
                <ReactECharts option={buildRollingVolatilityChart()} style={{ height: '100%', width: '100%', minHeight: '500px' }} notMerge={true} />
              </div>
              <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '16px', width: '33.333%' }}>
                <ReactECharts option={buildRollingScatterChart()} style={{ height: '100%', width: '100%', minHeight: '500px' }} notMerge={true} />
              </div>
            </div>
          </div>
        )}

        {page === 'page5' && (
            <div style={{ display: 'flex', height: '100%', padding: '10px', gap: '10px', boxSizing: 'border-box', background: '#f5f7fa' }}>
              {/* LEFT: Heatmap card — square, card shrinks to fit the square */}
              <div style={{ flex: '0 0 auto', height: '100%', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                <div style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
                  <ReactECharts
                    option={buildArbitrageHeatmap()}
                    style={{ height: '100%', width: '100%' }}
                    notMerge
                    onEvents={{
                      click: (params: any) => {
                        if (params.seriesType === 'heatmap') {
                          setSelectedArbitragePair([params.value[0] + 1, params.value[1] + 1]);
                        }
                      }
                    }}
                  />
                </div>
              </div>
              {/* RIGHT: trend + histogram stacked cards */}
              <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                  <ReactECharts option={buildArbitrageTrend()} style={{ height: '100%', width: '100%' }} notMerge />
                </div>
                <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                  <ReactECharts option={buildArbitrageHistogram()} style={{ height: '100%', width: '100%' }} notMerge />
                </div>
              </div>
            </div>
          )}
        </div>

        
        {/* ===== PAGE 7: STRATEGY SPREAD ===== */}
        {page === 'page7' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', padding: '10px', gap: '10px', boxSizing: 'border-box', background: '#f5f7fa' }}>

            {/* TOP BAR: title + controls */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '8px 16px' }}>
              <span style={{ fontWeight: 700, color: '#131722', fontSize: '15px' }}>策略：价差套利</span>
              <div style={{ width: '1px', height: '20px', background: '#e0e3eb' }} />
              <span style={{ fontWeight: 600, color: '#4b5563', fontSize: '13px' }}>套利时段对</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f5f7fa', border: '1px solid #e0e3eb', borderRadius: '8px', padding: '4px 10px' }}>
                <span style={{ color: '#787b86', fontSize: '12px' }}>时段A</span>
                <select
                  value={strategySpreadPointA}
                  onChange={e => setStrategySpreadPointA(Number(e.target.value))}
                  style={{ padding: '3px 6px', border: 'none', borderRadius: '4px', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#131722', background: 'transparent', cursor: 'pointer' }}>
                  {Array.from({length: 24}, (_, i) => i+1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f5f7fa', border: '1px solid #e0e3eb', borderRadius: '8px', padding: '4px 10px' }}>
                <span style={{ color: '#787b86', fontSize: '12px' }}>时段B</span>
                <select
                  value={strategySpreadPointB}
                  onChange={e => setStrategySpreadPointB(Number(e.target.value))}
                  style={{ padding: '3px 6px', border: 'none', borderRadius: '4px', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#131722', background: 'transparent', cursor: 'pointer' }}>
                  {Array.from({length: 24}, (_, i) => i+1).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: 'auto' }}>💡 点击热力图色块可快速选择时段组合</span>
            </div>

            {/* MAIN AREA: big heatmap + combined chart (trend + profit space, stacked) */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '10px' }}>

              {/* LEFT: Heatmap card — square, card shrinks to fit the square */}
              <div style={{ flex: '0 0 auto', height: '100%', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                <div style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
                <ReactECharts
                  option={buildStrategyScannerHeatmap()}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                  onEvents={{
                    click: (params: any) => {
                      if (params.seriesType === 'heatmap') {
                        setStrategySpreadPointA(params.data[0] + 1);
                        setStrategySpreadPointB(params.data[1] + 1);
                      }
                    }
                  }}
                />
                </div>
              </div>

              {/* RIGHT: Combined chart card (trend + profit space, stacked) */}
              <div style={{ flex: 1, minWidth: 0, height: '100%', background: '#fff', borderRadius: '10px', border: '1px solid #e0e3eb', boxShadow: '0 2px 8px rgba(19,23,34,0.05)', padding: '10px', boxSizing: 'border-box' }}>
                <ReactECharts option={buildStrategySpreadCombinedChart()} style={{ height: '100%', width: '100%' }} notMerge={true} />
              </div>

            </div>

          </div>
        )}

{/* RIGHT SIDEBAR (hidden on chart-dense pages to give the charts more room) */}
        {isSidebarVisible && page !== 'page7' && page !== 'page5' && page !== 'page2' && (
          <div className="tv-right-sidebar">
          <div className="tv-watchlist-header">
            <span>自选表</span>
            <div className="tv-watchlist-header-icons"><span>+</span><span>⊞</span><span>⋯</span></div>
          </div>
          <div className="tv-watchlist-cols"><span style={{ flex: 1 }}>Symbol</span><span>Last</span><span>Chg%</span></div>
          <div className="tv-watchlist-category">▾ 基本面指标 ({selectedDate || '—'})</div>
          {watchlistItems.map(item => {
            const stat = latestStats ? (latestStats as any)[item.key] : null;
            return (
              <div className="tv-watchlist-row" key={item.key}>
                <span className="symbol-icon" style={{ background: item.bg }}>{item.abbr}</span>
                <span className="symbol-name">{item.name}</span>
                <span className="symbol-last">{fmtNum(stat?.last)}</span>
                <span className="symbol-chg" style={{ color: pctColor(stat?.chg) }}>{fmtPct(stat?.chg)}</span>
              </div>
            );
          })}

          {/* Detail panel */}
          <div className="tv-detail-panel">
            <div className="tv-detail-header">
              <div className="tv-detail-avatar">GS</div>
              <span className="tv-detail-name">GS_POWER ({selectedDate || '—'})</span>
            </div>
            <div className="tv-detail-meta">
              甘肃省电力交易中心 · 现货市场<br />
              {data && `${data.meta.date_range.start} 至 ${selectedDate || data.meta.date_range.end}`}
            </div>
            {latestStats?.price && (
              <div className="tv-detail-price">
                {latestStats.price.last?.toFixed(2) || '—'}
                <span className="unit">CNY/MWh</span>
                <span className="chg" style={{ color: pctColor(latestStats.price.chg) }}>{fmtPct(latestStats.price.chg)}</span>
              </div>
            )}
            <div className="tv-detail-status">
              <span className="dot" style={{ background: '#089981' }}></span>
              <span style={{ color: '#089981' }}>数据已更新</span>
            </div>
            <div className="tv-keyfacts">
              <div className="tv-keyfacts-title">✨ 数据概览</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                共 <b>{data?.meta.total_hourly_records.toLocaleString()}</b> 条小时级记录<br />
                覆盖 <b>{data?.daily.length}</b> 天 / <b>{data?.weekly.length}</b> 周 / <b>{data?.monthly.length}</b> 月
              </div>
            </div>
          </div>
          </div>
        )}

        {/* FAR RIGHT ICON TABS */}
        <div className="tv-right-tabs">
          <button className={`tv-right-tab-btn ${isSidebarVisible ? 'active' : ''}`} onClick={() => setIsSidebarVisible(!isSidebarVisible)}>☰</button>
          <button className="tv-right-tab-btn">⏱</button>
          <button className="tv-right-tab-btn">🔔</button>
          <button className="tv-right-tab-btn">▦</button>
          <button className="tv-right-tab-btn">△</button>
          <div style={{ flex: 1 }} />
          <button className="tv-right-tab-btn">?</button>
        </div>
      </div>

      {/* TRADINGVIEW STYLE BOTTOM TOOLBAR */}
      <div className="tv-bottom-toolbar">
        <div className="tv-bottom-toolbar-left">
          {TIME_BTNS.map(ts => (
            <button key={ts.key} className={`tv-bottom-btn${timeScale === ts.key ? ' active' : ''}`}
              onClick={() => setTimeScale(ts.key)}>{ts.label}</button>
          ))}
          <div className="tv-toolbar-sep" style={{ margin: '0 8px' }} />
          {['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'].map((range, idx) => (
            <button key={idx} className={`tv-bottom-btn${dateRange === range ? ' active' : ''}`}
              onClick={() => {
                setDateRange(range);
                if (['1D', '5D'].includes(range)) setTimeScale('hourly');
                else if (['1M', '3M', '6M', 'YTD', '1Y'].includes(range)) setTimeScale('daily');
                else setTimeScale('monthly');
              }}>
              {range}
            </button>
          ))}
          <button className={`tv-calendar-btn tv-bottom-btn ${dateRange === 'Custom' ? 'active' : ''}`} onClick={() => setCalendarOpen(true)}>
            <svg viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="M14 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM4 4h10a1 1 0 0 1 1 1v1H3V5a1 1 0 0 1 1-1zm10 12H4a1 1 0 0 1-1-1V7h12v8a1 1 0 0 1-1 1zm-4-7v2H8V9h2zm-4 0v2H4V9h2zm8 0v2h-2V9h2zm-8 4v2H4v-2h2zm4 0v2H8v-2h2zm4 0v2h-2v-2h2z"></path></svg>
            {dateRange === 'Custom' ? (customDateStart + ' — ' + customDateEnd) : ''}
          </button>
        </div>
        <div className="tv-bottom-toolbar-right">
          <span><Clock /></span>
          <span style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>%</span>
          <span style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>log</span>
          <span style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>auto</span>
        </div>
      </div>

      {/* CALENDAR MODAL */}
      {calendarOpen && (
        <div className="tv-calendar-overlay" onClick={() => setCalendarOpen(false)}>
          <div className="tv-calendar-modal" onClick={e => e.stopPropagation()}>
            <div className="tv-calendar-header">Go to custom date range</div>
            <div className="tv-calendar-body">
              <div className="tv-calendar-input-group">
                <label>From</label>
                <input type="date" value={customDateStart} onChange={e => setCustomDateStart(e.target.value)} />
              </div>
              <div className="tv-calendar-input-group">
                <label>To</label>
                <input type="date" value={customDateEnd} onChange={e => setCustomDateEnd(e.target.value)} />
              </div>
            </div>
            <div className="tv-calendar-footer">
              <button className="tv-calendar-btn-action cancel" onClick={() => setCalendarOpen(false)}>Cancel</button>
              <button className="tv-calendar-btn-action apply" onClick={() => { setDateRange('Custom'); setCalendarOpen(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
