import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import dayjs from 'dayjs';
import isocalendar from 'dayjs/plugin/isoWeek.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(isocalendar);
dayjs.extend(customParseFormat);

const DATA_ROOT = "D:\\yangyang\\甘肃\\数据";
const OUT_FILE = path.join(DATA_ROOT, "power-trading-dashboard", "public", "data.json");

function getFiles(dir, pattern) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files.filter(f => f.endsWith(pattern)).map(f => path.join(dir, f));
}

// 1. Operations
function parseOperations() {
    const dir = path.join(DATA_ROOT, "日前运行信息");
    const files = getFiles(dir, ".xlsx").sort();
    let records = [];
    for (const file of files) {
        console.log(`  Reading operations: ${path.basename(file)}`);
        const workbook = xlsx.readFile(file, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            let dateVal = row[0];
            let dateStr = "";
            if (typeof dateVal === 'number') {
                const dateObj = xlsx.SSF.parse_date_code(dateVal);
                dateStr = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
            } else if (typeof dateVal === 'string') {
                dateStr = dayjs(dateVal).format('YYYY-MM-DD');
            } else if (dateVal instanceof Date) {
                dateStr = dayjs(dateVal).format('YYYY-MM-DD');
            }
            if (!dateStr || dateStr === 'Invalid Date') continue;
            
            let hourStr = String(row[1] || "");
            let periodMatch = hourStr.match(/(\d+)/);
            if (!periodMatch) continue;
            let period = parseInt(periodMatch[1], 10);
            
            const parseNum = (val) => {
                if (val === undefined || val === null || val === '') return null;
                const n = Number(val);
                return isNaN(n) ? null : n;
            };
            
            records.push({
                date: dateStr,
                period: period,
                load: parseNum(row[2]),
                interconnect_dayahead: parseNum(row[4]),
                wind: parseNum(row[6]),
                solar: parseNum(row[7]),
                renewables_total: parseNum(row[8]),
                hydro: parseNum(row[9]),
                generation_total: parseNum(row[10])
            });
        }
    }
    return records;
}

// 2. Prices
function parsePrices() {
    const dir = path.join(DATA_ROOT, "出清价格");
    const files = getFiles(dir, ".xlsx").sort();
    let records = [];
    for (const file of files) {
        console.log(`  Reading prices: ${path.basename(file)}`);
        const workbook = xlsx.readFile(file, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            let dateVal = row[0];
            let dateStr = "";
            if (typeof dateVal === 'number') {
                const dateObj = xlsx.SSF.parse_date_code(dateVal);
                dateStr = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
            } else if (typeof dateVal === 'string') {
                dateStr = dayjs(dateVal).format('YYYY-MM-DD');
            } else if (dateVal instanceof Date) {
                dateStr = dayjs(dateVal).format('YYYY-MM-DD');
            }
            if (!dateStr || dateStr === 'Invalid Date') continue;
            
            let hourStr = String(row[1] || "");
            let periodMatch = hourStr.match(/(\d+)/);
            if (!periodMatch) continue;
            let period = parseInt(periodMatch[1], 10);
            
            records.push({
                date: dateStr,
                period: period,
                dayahead_price_settlement: Number(row[4]) || null,
                realtime_price_settlement: Number(row[5]) || null
            });
        }
    }
    return records;
}

// 3. Weather
function parseWeather() {
    const dir = path.join(DATA_ROOT, "气象");
    const windFiles = getFiles(dir, ".xlsx").filter(f => {
        const base = path.basename(f);
        return base.startsWith("风速、地表短波辐射-城市加权-") && !base.includes("河东");
    });
    const tempFiles = getFiles(dir, ".xlsx").filter(f => {
        const base = path.basename(f);
        return base.startsWith("温度、地表总降水-省内-");
    });
    const files = [...windFiles, ...tempFiles].sort();
    
    let records = [];
    for (const file of files) {
        console.log(`  Reading weather: ${path.basename(file)}`);
        const yearMatch = path.basename(file).match(/(202\d)/);
        const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
        
        const workbook = xlsx.readFile(file, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
        
        if (data.length <= 3) continue;
        
        const row0 = data[0];
        const isTempFile = path.basename(file).startsWith("温度");
        let midTermRow = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] && data[i][0] === '中期') {
                midTermRow = i;
                break;
            }
        }
        if (midTermRow === -1) midTermRow = 2; // fallback

        const metricMap = isTempFile 
            ? { [midTermRow]: 'temperature', [midTermRow + 1]: 'rainfall' }
            : { [midTermRow]: 'wind_speed', [midTermRow + 1]: 'solar_radiation' };
        
        for (let data_row_idx of [midTermRow, midTermRow + 1]) {
            if (data_row_idx >= data.length) continue;
            let metric_name = metricMap[data_row_idx];
            
            let current_date = null;
            let current_period = 0;
            
            for (let col_idx = 2; col_idx < data[data_row_idx].length; col_idx++) {
                let header_val = row0[col_idx];
                if (header_val && typeof header_val === 'string' && header_val.includes('/')) {
                    let parts = header_val.split('/');
                    let month = parts[0].padStart(2, '0');
                    let day = parts[1].padStart(2, '0');
                    current_date = `${year}-${month}-${day}`;
                    current_period = 0;
                } else if (header_val && typeof header_val === 'number') {
                     const d = xlsx.SSF.parse_date_code(header_val);
                     if (d) {
                         current_date = `${year}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
                         current_period = 0;
                     }
                }
                
                current_period++;
                if (current_period > 24) continue;
                
                let val = data[data_row_idx][col_idx];
                if (current_date && val !== undefined && val !== null && val !== '') {
                    records.push({
                        date: current_date,
                        period: current_period,
                        metric: metric_name,
                        value: Number(val)
                    });
                }
            }
        }
    }
    
    let pivot = {};
    for (let r of records) {
        let key = `${r.date}_${r.period}`;
        if (!pivot[key]) {
            pivot[key] = { date: r.date, period: r.period };
        }
        pivot[key][r.metric] = r.value;
    }
    
    return Object.values(pivot);
}

function buildRecords(arr, timeKey) {
    return arr.map(row => {
        let rec = {};
        if (row[timeKey] !== undefined) rec[timeKey] = row[timeKey];
        if (timeKey === 'date_str' && row['date_str']) rec['date'] = row['date_str'];
        if (timeKey === 'week' && row['week']) rec['week'] = row['week'];
        if (timeKey === 'month' && row['month']) rec['month'] = row['month'];
        
        if (row.period !== undefined) rec.period = row.period;
        
        ['load', 'interconnect', 'wind', 'solar', 'hydro', 'renewables',
         'generation', 'price_dayahead', 'price_realtime',
         'wind_speed', 'solar_radiation', 'temperature', 'rainfall', 'bidding_space'].forEach(col => {
             if (row[col] !== undefined && row[col] !== null && !isNaN(row[col])) {
                 rec[col] = Math.round(row[col] * 100) / 100;
             }
         });
         return rec;
    });
}

// 4. Rolling (市场概况)
function parseRolling(prices) {
    const pricesMap = {};
    if (prices) {
        for (let p of prices) {
            pricesMap[`${p.date}_${p.period}`] = p.dayahead_price_settlement;
        }
    }

    const dir = path.join(DATA_ROOT, "市场概况");
    const files = getFiles(dir, ".xlsx").sort();
    let records = [];
    for (const file of files) {
        console.log(`  Reading rolling: ${path.basename(file)}`);
        const workbook = xlsx.readFile(file, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        
        for (let row of data) {
            let targetDate = row['标的日期'];
            let tradeDate = row['交易日期'];
            if (!targetDate || !tradeDate) continue;
            
            let targetDateStr = dayjs(targetDate).format('YYYY-MM-DD');
            let tradeDateStr = dayjs(tradeDate).format('YYYY-MM-DD');
            if (!targetDateStr || targetDateStr === 'Invalid Date' || !tradeDateStr || tradeDateStr === 'Invalid Date') continue;
            
            // "只要交易日期为标的期-2天的数据"
            let expectedTradeDate = dayjs(targetDateStr).subtract(2, 'day').format('YYYY-MM-DD');
            if (tradeDateStr !== expectedTradeDate) continue;
            
            let timeRange = row['时段类型'] || "";
            let periodMatch = timeRange.match(/-(\d+):00/);
            let period = 1;
            if (periodMatch) {
                period = parseInt(periodMatch[1], 10);
            }
            
            let weightedPrice = parseFloat(row['加权价格']) || 0;
            let dayaheadPrice = pricesMap[`${targetDateStr}_${period}`] || 0;
            let spread = weightedPrice - dayaheadPrice;
            
            records.push({
                target_date: targetDateStr,
                period: period,
                volume: parseFloat(row['总成交量(日均)']) || 0,
                max_price: parseFloat(row['最高价']) || 0,
                min_price: parseFloat(row['最低价']) || 0,
                spread: spread
            });
        }
    }
    return records;
}

function aggregateAndExport(ops, prices, weather, rolling) {
    let result = {};
    
    let mergedMap = {};
    
    for (let op of ops) {
        let key = `${op.date}_${op.period}`;
        mergedMap[key] = { ...op };
    }
    
    for (let pr of prices) {
        let key = `${pr.date}_${pr.period}`;
        if (!mergedMap[key]) mergedMap[key] = { date: pr.date, period: pr.period };
        mergedMap[key].price_dayahead = pr.dayahead_price_settlement;
        mergedMap[key].price_realtime = pr.realtime_price_settlement;
    }
    
    for (let w of weather) {
        let key = `${w.date}_${w.period}`;
        if (!mergedMap[key]) mergedMap[key] = { date: w.date, period: w.period };
        if (w.wind_speed !== undefined) mergedMap[key].wind_speed = w.wind_speed;
        if (w.solar_radiation !== undefined) mergedMap[key].solar_radiation = w.solar_radiation;
        if (w.temperature !== undefined) mergedMap[key].temperature = w.temperature;
        if (w.rainfall !== undefined) mergedMap[key].rainfall = w.rainfall;
    }
    
    let merged = Object.values(mergedMap).map(m => {
        const hasAll = m.load != null && m.interconnect_dayahead != null &&
                       m.wind != null && m.solar != null && m.hydro != null;
        let bs = hasAll ? (m.load + m.interconnect_dayahead - m.wind - m.solar - m.hydro) : undefined;
        
        let out = {
            ...m,
            date_str: m.date,
            interconnect: m.interconnect_dayahead,
            renewables: (m.wind || 0) + (m.solar || 0),
            generation: (m.wind || 0) + (m.solar || 0) + (m.hydro || 0)
        };
        if (bs !== undefined) out.bidding_space = bs;
        return out;
    });
    
    merged.sort((a,b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return a.period - b.period;
    });
    
    result.hourly = buildRecords(merged, 'date_str');
    
    function aggGroup(arr, keyFn) {
        let groups = {};
        for (let row of arr) {
            let key = keyFn(row);
            if (!groups[key]) groups[key] = { count: 0, sum: {} };
            groups[key].count++;
            
            ['load', 'interconnect', 'wind', 'solar', 'hydro', 'renewables', 'generation',
                'price_dayahead', 'price_realtime', 'wind_speed', 'solar_radiation', 'temperature', 'rainfall', 'bidding_space'].forEach(col => {
                if (row[col] !== undefined && row[col] !== null) {
                    groups[key].sum[col] = (groups[key].sum[col] || 0) + row[col];
                }
            });
        }
        
        let res = [];
        for (let key in groups) {
            let g = groups[key];
            let out = {};
            for (let col in g.sum) {
                out[col] = g.sum[col] / g.count;
            }
            out.key = key;
            res.push(out);
        }
        res.sort((a,b) => a.key.localeCompare(b.key));
        return res;
    }
    
    let daily = aggGroup(merged, r => r.date).map(r => ({...r, date_str: r.key}));
    result.daily = buildRecords(daily, 'date_str');
    
    let weekly = aggGroup(merged, r => {
        let d = dayjs(r.date);
        return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
    }).map(r => ({...r, week: r.key}));
    result.weekly = buildRecords(weekly, 'week');
    
    let monthly = aggGroup(merged, r => {
        let d = dayjs(r.date);
        return d.format('YYYY-MM');
    }).map(r => ({...r, month: r.key}));
    result.monthly = buildRecords(monthly, 'month');
    
    let start_date = merged.length > 0 ? merged[0].date : null;
    let end_date = merged.length > 0 ? merged[merged.length-1].date : null;
    
    result.meta = {
        total_hourly_records: result.hourly.length,
        total_daily_records: result.daily.length,
        total_weekly_records: result.weekly.length,
        total_monthly_records: result.monthly.length,
        total_rolling_records: rolling ? rolling.length : 0,
        date_range: { start: start_date, end: end_date },
        generated_at: new Date().toISOString()
    };
    
    if (rolling && rolling.length > 0) {
        result.rolling = rolling;
    }
    
    return result;
}

console.log("============================================================");
console.log("Parsing operations data...");
let ops = parseOperations();
console.log(`  Operations: ${ops.length} records`);

console.log("Parsing price data...");
let prices = parsePrices();
console.log(`  Prices: ${prices.length} records`);

console.log("Parsing weather data...");
let weather = [];
try {
    weather = parseWeather();
    console.log(`  Weather: ${weather.length} records`);
} catch (e) {
    console.log(`  Weather parsing failed: ${e}`);
}

console.log("Parsing rolling data...");
let rolling = [];
try {
    rolling = parseRolling(prices);
    console.log(`  Rolling: ${rolling.length} records`);
} catch (e) {
    console.log(`  Rolling parsing failed: ${e}`);
}

console.log("Aggregating and exporting...");
let result = aggregateAndExport(ops, prices, weather, rolling);

// write result
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf-8');

const fileSize = fs.statSync(OUT_FILE).size / (1024 * 1024);
console.log(`\nDone! Output: ${OUT_FILE}`);
console.log(`File size: ${fileSize.toFixed(2)} MB`);
console.log(`Hourly records: ${result.meta.total_hourly_records}`);
console.log(`Daily records: ${result.meta.total_daily_records}`);
console.log(`Weekly records: ${result.meta.total_weekly_records}`);
console.log(`Monthly records: ${result.meta.total_monthly_records}`);
console.log(`Date range: ${result.meta.date_range.start} to ${result.meta.date_range.end}`);
