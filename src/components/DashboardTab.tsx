import React from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Typography } from 'antd';
import { 
  ArrowUpOutlined, 
  AlertOutlined,
  ThunderboltOutlined,
  SunOutlined,
  RobotOutlined,
  SendOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;

export const DashboardTab: React.FC = () => {
  // Mock Data for Charts
  const timeAxis = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
  const loadData = [21000, 20500, 20000, 21500, 25000, 28000, 29500, 29000, 28500, 31000, 30000, 26000];
  const windData = [8000, 8500, 8200, 7500, 6000, 5500, 5000, 4800, 6000, 7500, 8000, 8200];
  const pvData =   [0, 0, 0, 1000, 4500, 8000, 11000, 10500, 7000, 2000, 0, 0];
  const hydroData = [5000, 5000, 5000, 5000, 5500, 6000, 6000, 6000, 6500, 7000, 6500, 5500];
  const gapData =  [1000, 1500, 2000, 500, -2000, -3000, -2500, -1000, -3500, -5000, -2000, 500];
  const priceData = [320, 310, 310, 330, 380, 420, 410, 400, 450, 520, 480, 360];
  const predictPriceData = [330, 320, 320, 340, 390, 430, 420, 410, 480, 550, 500, 370];

  const commonAxisProps = {
    axisLabel: { color: '#787b86' },
    splitLine: { lineStyle: { color: '#e0e3eb' } },
  };

  const curveOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['日前负荷', '日前风电', '日前光伏', '水电预测'], bottom: 0, textStyle: { color: '#131722' } },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: timeAxis, ...commonAxisProps },
    yAxis: { type: 'value', name: 'MW', ...commonAxisProps, nameTextStyle: { color: '#787b86' } },
    series: [
      { name: '日前负荷', type: 'line', data: loadData, itemStyle: { color: '#f23645' }, smooth: true, lineStyle: { width: 2 } },
      { name: '日前风电', type: 'line', data: windData, itemStyle: { color: '#089981' }, areaStyle: { opacity: 0.1 }, smooth: true },
      { name: '日前光伏', type: 'line', data: pvData, itemStyle: { color: '#f59e0b' }, areaStyle: { opacity: 0.1 }, smooth: true },
      { name: '水电预测', type: 'line', data: hydroData, itemStyle: { color: '#2962ff' }, areaStyle: { opacity: 0.1 }, smooth: true }
    ]
  };

  const gapOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: timeAxis, ...commonAxisProps },
    yAxis: { type: 'value', name: '供需缺口 (MW)', ...commonAxisProps, nameTextStyle: { color: '#787b86' } },
    visualMap: {
      show: false,
      pieces: [
        { gt: 0, color: '#f23645' },
        { lte: 0, color: '#089981' }
      ]
    },
    series: [{ name: '缺口', type: 'bar', data: gapData }]
  };

  const priceOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['日前价格(昨日)', '预测价格(今日)'], bottom: 0, textStyle: { color: '#131722' } },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: timeAxis, ...commonAxisProps },
    yAxis: { type: 'value', name: '元/MWh', ...commonAxisProps, nameTextStyle: { color: '#787b86' } },
    series: [
      { name: '日前价格(昨日)', type: 'line', data: priceData, itemStyle: { color: '#787b86' }, lineStyle: { type: 'dashed' } },
      { name: '预测价格(今日)', type: 'line', data: predictPriceData, itemStyle: { color: '#2962ff' }, smooth: true, lineStyle: { width: 2 } }
    ]
  };

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Status Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card className="stat-card" size="small" bordered={false}>
            <Statistic title="当前供需状态" value="偏紧" valueStyle={{ color: 'var(--error-color)', fontWeight: 'bold' }} prefix={<AlertOutlined />} />
            <div style={{ marginTop: 8 }}><Tag color="error" style={{ border: 'none' }}>缺口约 3500MW</Tag></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card" size="small" bordered={false}>
            <Statistic title="未来价格水平" value="高位运行" valueStyle={{ color: 'var(--error-color)', fontWeight: 'bold' }} prefix={<ArrowUpOutlined />} />
            <div style={{ marginTop: 8 }}><Tag color="warning" style={{ border: 'none' }}>晚高峰预警</Tag></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card" size="small" bordered={false}>
            <Statistic title="新能源出力状态" value="风弱光强" valueStyle={{ color: 'var(--warning-color)', fontWeight: 'bold' }} prefix={<SunOutlined />} />
            <div style={{ marginTop: 8 }}><Tag color="orange" style={{ border: 'none' }}>光伏下午快速退出</Tag></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card" size="small" bordered={false}>
            <Statistic title="整体风险等级" value="高风险" valueStyle={{ color: 'var(--error-color)', fontWeight: 'bold' }} prefix={<ThunderboltOutlined />} />
            <div style={{ marginTop: 8 }}><Tag color="error" style={{ border: 'none' }}>高峰时段建议购电</Tag></div>
          </Card>
        </Col>
      </Row>

      {/* Charts Row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="未来24小时多维出力预测" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={curveOption} style={{ height: '330px' }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="24小时供需平衡缺口预警" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={gapOption} style={{ height: '330px' }} />
          </Card>
        </Col>
      </Row>

      {/* Charts Row 2 */}
      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card title="日前价格分析走势" className="chart-card" size="small" bordered={false}>
            <ReactECharts option={priceOption} style={{ height: '330px' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="AI 交易员实时建议" className="chart-card ai-assistant-card" size="small" bordered={false} extra={<Button type="link" size="small">刷新</Button>}>
            <div className="chat-messages">
              <div className="chat-bubble ai">
                <div className="chat-bubble-title"><RobotOutlined /> AI 交易中心智脑</div>
                <div>
                  <Text style={{ color: '#f8fafc' }}>🚨 <b>风险提示：</b><br/>今日光伏将于18:00加速退出，叠加晚高峰空调负荷，19:00-21:00存在严重硬缺口。</Text>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Text style={{ color: '#f8fafc' }}>💡 <b>操作建议：</b></Text>
                  <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                    <li>立即在外送市场寻求通道置换。</li>
                    <li>日前现货市场以最高限价申报买入。</li>
                  </ul>
                </div>
              </div>
            </div>
            <Button type="primary" block icon={<SendOutlined />}>下达交易指令</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
