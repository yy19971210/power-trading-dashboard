import React from 'react';
import { Card, Row, Col, Select, DatePicker, Button, Table, Space, Typography, Statistic } from 'antd';
import { FilterOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export const HistoryTab: React.FC = () => {
  const commonAxisProps = {
    axisLabel: { color: '#787b86' },
    splitLine: { lineStyle: { color: '#e0e3eb' } },
  };

  // --- Historical Trend Option ---
  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['最高价格', '平均价格', '最低价格'], bottom: 0, textStyle: { color: '#131722' } },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07'], ...commonAxisProps },
    yAxis: { type: 'value', name: '元/MWh', ...commonAxisProps, nameTextStyle: { color: '#787b86' } },
    series: [
      { name: '最高价格', type: 'line', data: [450, 480, 520, 600, 580, 490, 470], itemStyle: { color: '#f23645' } },
      { name: '平均价格', type: 'line', data: [320, 310, 350, 400, 390, 330, 310], itemStyle: { color: '#2962ff' }, smooth: true, lineStyle: { width: 2 } },
      { name: '最低价格', type: 'line', data: [150, 120, 180, 200, 190, 160, 140], itemStyle: { color: '#089981' } }
    ]
  };

  // --- Heatmap Option ---
  const hours = ['负荷', '风电', '光伏', '水电', '联络线', '温度', '风速', '辐射'];
  const days = ['价格'];
  
  // Fake Pearson correlation data (-1 to 1)
  const heatmapData = [
    [0, 0, 0.85], // 负荷 vs 价格 (High positive)
    [1, 0, -0.65], // 风电 vs 价格 (Negative)
    [2, 0, -0.75], // 光伏 vs 价格 (Negative)
    [3, 0, -0.40], // 水电 vs 价格
    [4, 0, 0.60], // 联络线 vs 价格
    [5, 0, 0.55], // 温度 vs 价格
    [6, 0, -0.50], // 风速 vs 价格
    [7, 0, -0.60]  // 辐射 vs 价格
  ];

  const heatmapOption = {
    tooltip: { position: 'top' },
    grid: { height: '50%', top: '10%' },
    xAxis: { type: 'category', data: hours, splitArea: { show: true }, ...commonAxisProps },
    yAxis: { type: 'category', data: days, splitArea: { show: true }, ...commonAxisProps },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%',
      inRange: { color: ['#089981', '#f8f9fd', '#f23645'] },
      textStyle: { color: '#787b86' }
    },
    series: [{
      name: '相关系数', type: 'heatmap', data: heatmapData,
      label: { show: true, color: '#131722' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.2)' } }
    }]
  };

  // --- Typical Day Deviation Curve ---
  const typicalOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['日前预测价格', '实际出清价格'], bottom: 0, textStyle: { color: '#131722' } },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: ['00:00','04:00','08:00','12:00','16:00','20:00','24:00'], ...commonAxisProps },
    yAxis: { type: 'value', ...commonAxisProps },
    series: [
      { name: '日前预测价格', type: 'line', data: [250, 240, 310, 350, 420, 520, 300], itemStyle: { color: '#787b86' }, lineStyle: { type: 'dashed' } },
      { name: '实际出清价格', type: 'line', data: [260, 250, 330, 380, 400, 600, 320], itemStyle: { color: '#2962ff' }, smooth: true, lineStyle: { width: 2 } }
    ]
  };

  // --- Event Table ---
  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', render: (text: string) => <Text style={{color: '#787b86'}}>{text}</Text> },
    { title: '事件类型', dataIndex: 'type', key: 'type', render: (type: string) => (
      type === '高价' ? <Text type="danger"><RiseOutlined /> 高价事件</Text> : <Text type="success"><FallOutlined /> 低价事件</Text>
    )},
    { title: '核心原因剖析', dataIndex: 'reason', key: 'reason', render: (text: string) => <Text style={{color: '#131722'}}>{text}</Text> },
  ];

  const eventData = [
    { key: '1', date: '2026-01-15', type: '高价', reason: '1.晚高峰负荷突增 2.新能源极寒低发 3.联络线晚间增送' },
    { key: '2', date: '2026-03-12', type: '低价', reason: '1.全网风光大发 2.气温适宜负荷骤降 3.省内供需极度宽松' }
  ];

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Filters */}
      <Card size="small" bordered={false} style={{ marginBottom: 16 }}>
        <Space size="middle" wrap>
          <RangePicker style={{ background: '#ffffff', borderColor: '#e0e3eb' }} />
          <Select defaultValue="all" style={{ width: 140 }} options={[{ value: 'all', label: '所有市场状态' }, { value: 'high_load', label: '高负荷日' }, { value: 'high_pv', label: '新能源大发日' }]} />
          <Select defaultValue="temp" style={{ width: 120 }} options={[{ value: 'temp', label: '全部温度' }, { value: 'hot', label: '极热' }, { value: 'cold', label: '极寒' }]} />
          <Button type="primary" icon={<FilterOutlined />}>开始深度分析</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* Row 1: KPI & Trend */}
        <Col span={6}>
          <Card title="预测偏差复盘 (KPI)" className="chart-card" size="small" bordered={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingTop: '16px' }}>
               <Statistic title="新能源日前预测 MAE" value="4.2%" valueStyle={{ color: 'var(--warning-color)' }} />
               <Statistic title="全网负荷预测 RMSE" value="185 MW" valueStyle={{ color: 'var(--success-color)' }} />
               <div>
                 <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>最大偏差易发时段</Text>
                 <Button type="primary" danger ghost size="small">17:00 ~ 19:00 (光伏退群期)</Button>
               </div>
            </div>
          </Card>
        </Col>
        <Col span={18}>
          <Card title="历史价格走势与极值追溯" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={trendOption} style={{ height: '320px' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Row 2: Typical Curve, Correlation, Events */}
        <Col span={8}>
          <Card title="典型日价格复盘 (预测 vs 实际)" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={typicalOption} style={{ height: '280px' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="价格影响因子相关性矩阵" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={heatmapOption} style={{ height: '280px' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="典型市场异常事件自动捕捉" className="chart-card" size="small" bordered={false}>
            <Table dataSource={eventData} columns={columns} pagination={false} size="small" bordered={false} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
