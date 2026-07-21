import React, { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import './App.css';

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
type PageId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'page6' | 'page7';

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
];

// ===============================
// Helpers
// ===============================
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<TimeScale>('hourly');
  const [dateRange, setDateRange] = useState<string>('1M');
  
  // Page 5 specific state
  const [selectedArbitragePair, setSelectedArbitragePair] = useState<[number, number]>([4, 19]);
    const [strategySpreadPointA, setStrategySpreadPointA] = useState<number>(16);
  const [strategySpreadPointB, setStrategySpreadPointB] = useState<number>(14);
const [selectedRollingPeriod, setSelectedRollingPeriod] = useState<number>(1);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [weatherMetric, setWeatherMetric] = useState<'wind'|'solar'|'load'|'hydro'>('wind');
  const [page, setPage] = useState<PageId>('page1');
  const [activeView, setActiveView] = useState<'overview' | 'detail'>('overview');
  
  // Custom Date Modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }) + ' (UTC+8)');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
  }, []);

  useEffect(() => {
    fetch('/data.json')
      .then(r => r.json())
      .then((d: DataPayload) => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
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
        { type: 'value', name: outputLabel, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } },
        { type: 'value', name: weatherLabel, nameTextStyle: { fontSize: 9, color: '#787b86' }, axisLabel: { fontSize: 9, color: '#787b86' }, splitLine: { show: false } }
      ],
      series: [
        { name: outputLabel, type: 'line', data: outputData, yAxisIndex: 0, itemStyle: { color: color }, symbol: 'none', lineStyle: { width: 1.5 } },
        { name: weatherLabel, type: 'line', data: weatherData, yAxisIndex: 1, itemStyle: { color: '#787b86' }, symbol: 'none', lineStyle: { width: 1.5, type: 'dashed' } }
      ]
    };
  };

  // -- Page 3: Bidding Space vs Price --
  const buildBiddingChart = () => {
    const pairs: [number, number, string][] = [];
    currentData.forEach((r: any, i: number) => {
      const bs = r.bidding_space, price = r.price_dayahead;
      const dateLabel = xLabels[i] || '';
      if (bs != null && price != null && isFinite(bs) && isFinite(price)) pairs.push([bs, price, dateLabel]);
    });
    if (pairs.length < 2) return {};

    const reg = linearRegression(pairs);
    const xMin = Math.min(...pairs.map(p => p[0]));
    const xMax = Math.max(...pairs.map(p => p[0]));
    const regLine = [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]];

    // Color-code by price: red for high, blue for low
    const priceMin = Math.min(...pairs.map(p => p[1]));
    const priceMax = Math.max(...pairs.map(p => p[1]));

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (p.seriesType === 'scatter') {
            const v = p.value || p.data || [];
            return `时间: ${v[2] || '—'}<br/>竞价空间: ${v[0]?.toFixed(0)} MW<br/>日前价格: ${v[1]?.toFixed(2)} 元/MWh`;
          }
          return '';
        },
        backgroundColor: '#fff', borderColor: '#e0e3eb', textStyle: { color: '#131722', fontSize: 12 }
      },
      grid: { left: 16, right: 70, top: 80, bottom: 40, containLabel: true },
      title: {
        text: '日前竞价空间 vs 日前价格',
        subtext: `竞价空间 = 日前负荷 + 联络线 - 风电 - 光伏 - 水电\nR² = ${reg.r2.toFixed(4)}  |  y = ${reg.slope.toFixed(6)}x + ${reg.intercept.toFixed(2)}  |  N = ${pairs.length}`,
        left: 12, top: 4,
        textStyle: { color: '#131722', fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: '#787b86', fontSize: 11, lineHeight: 16 }
      },
      visualMap: {
        show: true, type: 'continuous',
        min: priceMin, max: priceMax,
        dimension: 1,
        inRange: { color: ['#2962ff', '#089981', '#f59e0b', '#f23645'] },
        right: 8, top: 60, text: ['高价', '低价'],
        textStyle: { color: '#787b86', fontSize: 10 },
        itemWidth: 10, itemHeight: 100
      },
      xAxis: { type: 'value', name: '竞价空间 (MW)', nameLocation: 'center', nameGap: 28,
        nameTextStyle: { color: '#787b86', fontSize: 12 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { lineStyle: { color: '#e0e3eb' } } },
      yAxis: { type: 'value', name: '日前价格 (元/MWh)', nameLocation: 'center', nameGap: 48,
        nameTextStyle: { color: '#787b86', fontSize: 12 },
        axisLabel: { color: '#131722', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f3fa' } },
        axisLine: { show: false } },
      series: [
        { type: 'scatter', data: pairs, symbolSize: 5,
          large: pairs.length > 50000, largeThreshold: 50000 },
        { type: 'line', data: regLine, symbol: 'none',
          lineStyle: { color: '#131722', width: 2, type: 'dashed' },
          tooltip: { show: false } }
      ]
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
      title: { text: '全时段平均套利空间矩阵 (日前 - 现货)', left: 0, top: 0, textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 } },
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const a = p.value[0] + 1;
          const b = p.value[1] + 1;
          const space = p.value[2].toFixed(2);
          return `时段 A: ${a}<br/>时段 B: ${b}<br/>平均套利空间: <b>${space}</b> 元/MWh`;
        }
      },
      grid: { height: '80%', top: 35, right: 45, left: 35, bottom: 35 },
      xAxis: { type: 'category', data: periods, name: '时段A', splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category', data: periods, name: '时段B', splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'center',
        itemWidth: 10,
        inRange: { color: ['#089981', '#ffffff', '#f23645'] }
      },
      series: [{
        name: '套利空间',
        type: 'heatmap',
        data: strategyScannerData,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
    };
  };

  const buildStrategyTrendLineChart = () => {
    if (!strategySpreadData || strategySpreadData.length === 0) return {};
    const dates = strategySpreadData.map(d => d.date);
    const da = strategySpreadData.map(d => d.daSpread);
    const rt = strategySpreadData.map(d => d.rtSpread);
    const intervalStep = dates.length > 15 ? Math.floor(dates.length / 10) : 0;

    return {
      title: { text: `价差趋势对比 (时段 ${strategySpreadPointB} - 时段 ${strategySpreadPointA})`, left: 0, top: 0, textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 } },
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#888', width: 1 } }
      },
      legend: { data: ['日前结算价差', '加权交易均价差'], top: 0, right: 0, textStyle: { fontSize: 12 } },
      grid: { top: 35, bottom: 25, left: 55, right: 20, containLabel: false },
      xAxis: { 
        type: 'category', 
        data: dates, 
        boundaryGap: true, 
        axisTick: { alignWithLabel: true },
        axisLabel: { 
          fontSize: 10, 
          interval: intervalStep,
          formatter: (val: string) => (val && val.length >= 10 ? val.slice(5) : val)
        } 
      },
      yAxis: { type: 'value', name: '元/MWh', nameGap: 10, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLabel: { fontSize: 10, width: 40 } },
      series: [
        { name: '日前结算价差', type: 'line', data: da, itemStyle: { color: '#2962ff' }, smooth: true, lineStyle: { width: 2 } },
        { name: '加权交易均价差', type: 'line', data: rt, itemStyle: { color: '#e91e63' }, smooth: true, lineStyle: { width: 2 } }
      ]
    };
  };

  const buildStrategySpreadBarChart = () => {
    if (!strategySpreadData || strategySpreadData.length === 0) return {};
    const dates = strategySpreadData.map(d => d.date);
    const spaces = strategySpreadData.map(d => d.space);
    const intervalStep = dates.length > 15 ? Math.floor(dates.length / 10) : 0;

    return {
      title: { text: `套利收益空间 (日前价差 - 加权均价差)`, left: 0, top: 0, textStyle: { color: '#131722', fontSize: 13, fontWeight: 600 } },
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#888', width: 1 } }
      },
      grid: { top: 35, bottom: 25, left: 55, right: 20, containLabel: false },
      xAxis: { 
        type: 'category', 
        data: dates, 
        boundaryGap: true, 
        axisTick: { alignWithLabel: true },
        axisLabel: { 
          fontSize: 10, 
          interval: intervalStep,
          formatter: (val: string) => (val && val.length >= 10 ? val.slice(5) : val)
        } 
      },
      yAxis: { type: 'value', name: '元/MWh', nameGap: 10, splitLine: { lineStyle: { color: '#f0f3fa' } }, axisLabel: { fontSize: 10, width: 40 } },
      series: [
        { 
          name: '套利空间', 
          type: 'bar', 
          data: spaces,
          itemStyle: {
            color: (params: any) => params.value > 0 ? '#f23645' : '#089981'
          }
        }
      ]
    };
  };

  const buildArbitrageHeatmap = () => {
    const { heatmapData, avgPrices } = getArbitrageData();
    if (!heatmapData.length) return {};
    
    const hours = Array.from({length: 24}, (_, i) => `${String(i + 1).padStart(2, '0')}:00`);
    
    const values = heatmapData.map(d => d[2]);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal));

    return {
      title: { text: '统一结算点日前价格(结算) 24时段套利均价差热力图', left: 8, top: 0, textStyle: { color: '#131722', fontSize: 14 } },
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const buy = p.value[0] + 1;
          const sell = p.value[1] + 1;
          const spread = p.value[2].toFixed(2);
          return `买入: ${buy}:00<br/>卖出: ${sell}:00<br/>均价差: <b>${spread}</b> 元`;
        }
      },
      grid: { height: '80%', top: 30, right: 60, left: 60 },
      xAxis: { type: 'category', data: hours, name: '买入时段', splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category', data: hours, name: '卖出时段', splitArea: { show: true }, axisLabel: { fontSize: 10 } },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'center',
        inRange: { color: ['#089981', '#ffffff', '#f23645'] }
      },
      series: [{
        type: 'heatmap',
        data: heatmapData,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
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
                heatData.push([p, d, r.spread]);
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
        formatter: (p: any) => `标的日期: ${dates[p.data[1]]}<br/>时段: ${periods[p.data[0]]}:00<br/>交易机会价差: <b>${p.data[2].toFixed(2)}</b> 元/MWh`
      },
      grid: { top: 40, height: dates.length * 25, left: 80, right: 80 },
      xAxis: { type: 'category', data: periods.map(p => `${p}:00`), splitArea: { show: true } },
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
        label: { show: true, fontSize: 10, formatter: (p: any) => p.data[2].toFixed(2) },
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
          renderItem: function (params: any, api: any) {
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

        {/* CENTER CHART AREA */}
        <div className="tv-chart-area">
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

          {/* ===== PAGE 2: SCATTER / CORRELATION ===== */}
          {page === 'page2' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #e0e3eb', marginBottom: '4px' }}>
                {[
                  { id: 'wind', label: '风电 vs 风速' },
                  { id: 'solar', label: '光伏 vs 辐射' },
                  { id: 'load', label: '负荷 vs 温度' },
                  { id: 'hydro', label: '水电 vs 降水' },
                ].map(item => (
                  <button 
                    key={item.id}
                    style={{
                      padding: '6px 16px', background: 'transparent', border: 'none',
                      borderBottom: weatherMetric === item.id ? '2px solid #2962ff' : '2px solid transparent',
                      color: weatherMetric === item.id ? '#2962ff' : '#787b86',
                      fontWeight: weatherMetric === item.id ? 600 : 400,
                      cursor: 'pointer', fontSize: '13px'
                    }}
                    onClick={() => setWeatherMetric(item.id as any)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <div style={{ width: '60%', borderRight: '1px solid #e0e3eb', height: '100%' }}>
                  {weatherMetric === 'wind' && <ReactECharts option={buildWeatherTimeSeriesChart('wind_speed', 'wind', '风速', '风电出力', '#089981')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'solar' && <ReactECharts option={buildWeatherTimeSeriesChart('solar_radiation', 'solar', '辐射', '光伏出力', '#f59e0b')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'load' && <ReactECharts option={buildWeatherTimeSeriesChart('temperature', 'load', '温度', '系统负荷', '#f23645')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'hydro' && <ReactECharts option={buildWeatherTimeSeriesChart('rainfall', 'hydro', '降水', '水电出力', '#2962ff')} style={{ height: '100%' }} notMerge />}
                </div>
                <div style={{ width: '40%', height: '100%' }}>
                  {weatherMetric === 'wind' && <ReactECharts option={buildScatterChart('wind_speed', 'wind', '风速 (m/s)', '风电出力 (MW)', '#089981')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'solar' && <ReactECharts option={buildScatterChart('solar_radiation', 'solar', '短波辐射 (W/m²)', '光伏出力 (MW)', '#f59e0b')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'load' && <ReactECharts option={buildScatterChart('temperature', 'load', '温度 (°C)', '系统负荷 (MW)', '#f23645')} style={{ height: '100%' }} notMerge />}
                  {weatherMetric === 'hydro' && <ReactECharts option={buildScatterChart('rainfall', 'hydro', '降水 (mm)', '水电出力 (MW)', '#2962ff')} style={{ height: '100%' }} notMerge />}
                </div>
              </div>
            </div>
          )}

          {/* ===== PAGE 3: BIDDING SPACE ===== */}
          {page === 'page3' && (
            <>

              <div style={{ height: '100%', paddingTop: 4 }}>
                <ReactECharts option={buildBiddingChart()} style={{ height: '100%' }} notMerge />
              </div>
            </>
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
                      setSelectedRollingPeriod(params.data[0] + 1);
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
            <div style={{ display: 'flex', height: '100%', padding: '4px' }}>
              <div style={{ width: '50%', height: '100%', borderRight: '1px solid #e0e3eb', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ height: '90%', aspectRatio: '1 / 1' }}>
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
              <div style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '50%', borderBottom: '1px solid #e0e3eb' }}>
                  <ReactECharts option={buildArbitrageTrend()} style={{ height: '100%' }} notMerge />
                </div>
                <div style={{ height: '50%' }}>
                  <ReactECharts option={buildArbitrageHistogram()} style={{ height: '100%' }} notMerge />
                </div>
              </div>
            </div>
          )}
        </div>

        
        {/* ===== PAGE 7: STRATEGY SPREAD ===== */}
        {page === 'page7' && (
          <div style={{ display: 'flex', height: '100%', padding: '8px', gap: '12px', boxSizing: 'border-box' }}>
            
            {/* LEFT COLUMN: Controls + Heatmap */}
            <div style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0, paddingBottom: '8px', borderBottom: '1px solid #f0f3fa' }}>
                <span style={{ fontWeight: 600, color: '#131722', fontSize: '13px' }}>选择套利时段对：</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#4b5563', fontSize: '13px' }}>时段A:</span>
                  <select 
                    value={strategySpreadPointA}
                    onChange={e => setStrategySpreadPointA(Number(e.target.value))}
                    style={{ padding: '4px 8px', border: '1px solid #e0e3eb', borderRadius: '4px', outline: 'none', fontSize: '13px' }}>
                    {Array.from({length: 24}, (_, i) => i+1).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#4b5563', fontSize: '13px' }}>时段B:</span>
                  <select 
                    value={strategySpreadPointB}
                    onChange={e => setStrategySpreadPointB(Number(e.target.value))}
                    style={{ padding: '4px 8px', border: '1px solid #e0e3eb', borderRadius: '4px', outline: 'none', fontSize: '13px' }}>
                    {Array.from({length: 24}, (_, i) => i+1).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
                <div style={{ height: '100%', aspectRatio: '1 / 1', maxHeight: '100%' }}>
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
            </div>

            {/* RIGHT COLUMN: Synchronized Trend Line Chart & Bar Chart */}
            <div style={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ flex: 1, background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '12px', minHeight: 0 }}>
                <ReactECharts onChartReady={(chart) => { chart.group = 'strategyRightGroup'; echarts.connect('strategyRightGroup'); }} option={buildStrategyTrendLineChart()} style={{ height: '100%', width: '100%' }} notMerge={true} />
              </div>
              <div style={{ flex: 1, background: '#fff', borderRadius: '4px', border: '1px solid #e0e3eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '12px', minHeight: 0 }}>
                <ReactECharts onChartReady={(chart) => { chart.group = 'strategyRightGroup'; echarts.connect('strategyRightGroup'); }} option={buildStrategySpreadBarChart()} style={{ height: '100%', width: '100%' }} notMerge={true} />
              </div>
            </div>

          </div>
        )}

{/* RIGHT SIDEBAR */}
        {isSidebarVisible && (
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
          <span>{currentTime}</span>
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
