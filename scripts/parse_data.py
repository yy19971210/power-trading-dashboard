"""
Parse all xlsx data files and output JSON for the dashboard frontend.
V2: Added weather merge, bidding space calculation, and proper weather metric naming.

Data definitions:
  - Period "1" or "01:00" = interval 00:00-01:00; full day = periods 1-24
  - Aggregations: 24时段 (raw hourly), 日均值 (daily avg), 周均值 (natural week), 月均值 (natural month)
"""
import pandas as pd
import json
import os
import glob
import re
from datetime import datetime

DATA_ROOT = r"D:\yangyang\甘肃\数据"
OUT_FILE = os.path.join(DATA_ROOT, "power-trading-dashboard", "public", "data.json")

# =============================================
# 1. Parse 日前运行信息 (Operations Data)
# =============================================
def parse_operations():
    pattern = os.path.join(DATA_ROOT, "日前运行信息", "*.xlsx")
    files = sorted(glob.glob(pattern))
    frames = []
    for f in files:
        print(f"  Reading operations: {os.path.basename(f)}")
        df = pd.read_excel(f)
        df.columns = ['date', 'hour', 'load', 'load_week', 'interconnect_dayahead', 'interconnect_week',
                       'wind', 'solar', 'renewables_total', 'hydro', 'generation_total', 'renewables_disclosed']
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined['date'] = pd.to_datetime(combined['date'])
    combined['period'] = combined['hour'].astype(str).str.extract(r'(\d+)').astype(int)
    combined = combined.sort_values(['date', 'period']).reset_index(drop=True)
    return combined

# =============================================
# 2. Parse 出清价格 (Price Data)
# =============================================
def parse_prices():
    pattern = os.path.join(DATA_ROOT, "出清价格", "*.xlsx")
    files = sorted(glob.glob(pattern))
    frames = []
    for f in files:
        print(f"  Reading prices: {os.path.basename(f)}")
        df = pd.read_excel(f)
        df.columns = ['date', 'hour', 'dayahead_price_settlement', 'realtime_price_settlement',
                       'dayahead_price_buy', 'realtime_price_buy']
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined['date'] = pd.to_datetime(combined['date'])
    combined['period'] = combined['hour'].astype(str).str.extract(r'(\d+)').astype(int)
    combined = combined.sort_values(['date', 'period']).reset_index(drop=True)
    return combined

# =============================================
# 3. Parse 气象 (Weather Data) - transposed format
# =============================================
def parse_weather():
    wind_pattern = os.path.join(DATA_ROOT, "气象", "风速、地表短波辐射-城市加权-*.xlsx")
    temp_pattern = os.path.join(DATA_ROOT, "气象", "温度、地表总降水-省内-*.xlsx")
    
    wind_files = [f for f in glob.glob(wind_pattern) if "河东" not in os.path.basename(f)]
    temp_files = glob.glob(temp_pattern)
    files = sorted(wind_files + temp_files)
    
    records = []
    for f in files:
        base_name = os.path.basename(f)
        print(f"  Reading weather: {base_name}")
        year_match = re.search(r'(202\d)', base_name)
        year = year_match.group(1) if year_match else str(datetime.now().year)
        df = pd.read_excel(f, header=None)
        
        # Structure: Row 0 = date headers (MM/DD), Row 1 = period labels (1-24),
        # Row 2 = metric 1, Row 3 = metric 2
        row0 = df.iloc[0].tolist()
        
        is_temp = "温度" in base_name
        metric_map = {2: 'temperature', 3: 'rainfall'} if is_temp else {2: 'wind_speed', 3: 'solar_radiation'}
        
        for data_row_idx in [2, 3]:
            if data_row_idx >= len(df):
                continue
            metric_name = metric_map.get(data_row_idx, f'metric_{data_row_idx}')
            
            current_date = None
            current_period = 0
            for col_idx in range(2, len(df.columns)):
                header_val = row0[col_idx] if col_idx < len(row0) else None
                if pd.notna(header_val) and isinstance(header_val, str) and '/' in str(header_val):
                    current_date = f"{year}/{header_val}"
                    current_period = 0
                
                current_period += 1
                if current_period > 24:
                    continue
                
                val = df.iloc[data_row_idx, col_idx]
                if current_date and pd.notna(val):
                    try:
                        records.append({
                            'date': current_date,
                            'period': current_period,
                            'metric': metric_name,
                            'value': float(val)
                        })
                    except (ValueError, TypeError):
                        pass
    
    if not records:
        return pd.DataFrame()
    
    wdf = pd.DataFrame(records)
    wdf_pivot = wdf.pivot_table(index=['date', 'period'], columns='metric', values='value', aggfunc='first').reset_index()
    wdf_pivot['date'] = pd.to_datetime(wdf_pivot['date'], format='mixed', dayfirst=False)
    wdf_pivot = wdf_pivot.sort_values(['date', 'period']).reset_index(drop=True)
    return wdf_pivot

# =============================================
# 4. Aggregate & Export
# =============================================
def build_records(df, time_key='date_str'):
    """Build JSON records from a dataframe with standard columns."""
    records = []
    for _, row in df.iterrows():
        rec = {}
        # Add time key
        if time_key in row.index:
            rec['date'] = row[time_key]
            if pd.notna(row.get('wind_speed')): rec['wind_speed'] = round(row['wind_speed'], 2)
            if pd.notna(row.get('solar_radiation')): rec['solar_radiation'] = round(row['solar_radiation'], 2)
            if pd.notna(row.get('temperature')): rec['temperature'] = round(row['temperature'], 2)
            if pd.notna(row.get('rainfall')): rec['rainfall'] = round(row['rainfall'], 2)
            
            if pd.notna(row.get('bidding_space')): rec['bidding_space'] = round(row['bidding_space'], 2)
        elif 'week' in row.index:
            rec['week'] = row['week']
        elif 'month' in row.index:
            rec['month'] = row['month']
        elif 'date' in row.index:
            rec['date'] = row['date']
        
        # Add all numeric fields
        for col in ['load', 'interconnect', 'wind', 'solar', 'hydro', 'renewables',
                     'generation', 'price_dayahead', 'price_realtime',
                     'wind_speed', 'solar_radiation', 'bidding_space']:
            if col in row.index:
                val = row[col]
                rec[col] = round(float(val), 2) if pd.notna(val) else None
        
        # For hourly data, include period
        if 'period' in row.index:
            rec['period'] = int(row['period'])
        
        records.append(rec)
    return records


def aggregate_and_export(ops, prices, weather):
    result = {}
    
    # Merge ops and prices on date+period
    merged = pd.merge(ops, prices[['date', 'period', 'dayahead_price_settlement', 'realtime_price_settlement']], 
                       on=['date', 'period'], how='left')
    
    # Merge weather if available
    if weather is not None and len(weather) > 0:
        merged = pd.merge(merged, weather, on=['date', 'period'], how='left')
    else:
        merged['wind_speed'] = None
        merged['solar_radiation'] = None
    
    # Rename for consistency
    merged = merged.rename(columns={
        'interconnect_dayahead': 'interconnect',
        'renewables_total': 'renewables',
        'generation_total': 'generation',
        'dayahead_price_settlement': 'price_dayahead',
        'realtime_price_settlement': 'price_realtime',
    })
    
    # Calculate bidding space: load + interconnect - wind - solar - hydro
    merged['bidding_space'] = merged['load'] + merged['interconnect'] - merged['wind'] - merged['solar'] - merged['hydro']
    
    merged['date_str'] = merged['date'].dt.strftime('%Y-%m-%d')
    
    # ---- HOURLY ----
    hourly_cols = ['date_str', 'period', 'load', 'interconnect', 'wind', 'solar', 'hydro',
                    'renewables', 'generation', 'price_dayahead', 'price_realtime',
                    'wind_speed', 'solar_radiation', 'bidding_space']
    result['hourly'] = build_records(merged[hourly_cols], time_key='date_str')
    
    # ---- DAILY ----
    agg_cols = ['load', 'interconnect', 'wind', 'solar', 'hydro', 'renewables', 'generation',
                'price_dayahead', 'price_realtime', 'wind_speed', 'solar_radiation', 'bidding_space']
    daily = merged.groupby(merged['date'].dt.strftime('%Y-%m-%d'))[agg_cols].mean().reset_index()
    daily = daily.rename(columns={'date': 'date_str'})
    result['daily'] = build_records(daily, time_key='date_str')
    
    # ---- WEEKLY ----
    merged_w = merged.copy()
    merged_w['week'] = merged_w['date'].dt.isocalendar().year.astype(str) + '-W' + \
                        merged_w['date'].dt.isocalendar().week.astype(str).str.zfill(2)
    weekly = merged_w.groupby('week')[agg_cols].mean().reset_index()
    result['weekly'] = build_records(weekly, time_key='week')
    
    # ---- MONTHLY ----
    merged_m = merged.copy()
    merged_m['month'] = merged_m['date'].dt.strftime('%Y-%m')
    monthly = merged_m.groupby('month')[agg_cols].mean().reset_index()
    result['monthly'] = build_records(monthly, time_key='month')
    
    # ---- META ----
    result['meta'] = {
        'total_hourly_records': len(result['hourly']),
        'total_daily_records': len(result['daily']),
        'total_weekly_records': len(result['weekly']),
        'total_monthly_records': len(result['monthly']),
        'date_range': {
            'start': ops['date'].min().strftime('%Y-%m-%d'),
            'end': ops['date'].max().strftime('%Y-%m-%d'),
        },
        'generated_at': datetime.now().isoformat(),
    }
    
    return result


if __name__ == '__main__':
    print("=" * 60)
    print("Parsing operations data...")
    ops = parse_operations()
    print(f"  Operations: {len(ops)} records")
    
    print("Parsing price data...")
    prices = parse_prices()
    print(f"  Prices: {len(prices)} records")
    
    print("Parsing weather data...")
    try:
        weather = parse_weather()
        print(f"  Weather: {len(weather)} records")
    except Exception as e:
        print(f"  Weather parsing failed: {e}")
        weather = None
    
    print("Aggregating and exporting...")
    result = aggregate_and_export(ops, prices, weather)
    
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    
    file_size = os.path.getsize(OUT_FILE) / (1024 * 1024)
    print(f"\nDone! Output: {OUT_FILE}")
    print(f"File size: {file_size:.2f} MB")
    print(f"Hourly records: {result['meta']['total_hourly_records']}")
    print(f"Daily records: {result['meta']['total_daily_records']}")
    print(f"Weekly records: {result['meta']['total_weekly_records']}")
    print(f"Monthly records: {result['meta']['total_monthly_records']}")
    print(f"Date range: {result['meta']['date_range']['start']} to {result['meta']['date_range']['end']}")
    
    # Verify key fields in first record
    sample = result['hourly'][0]
    print(f"\nSample hourly record keys: {list(sample.keys())}")
    print(f"Sample: {sample}")
