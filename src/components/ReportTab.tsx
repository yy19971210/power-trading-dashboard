import React from 'react';
import { Card, Button, Typography, Divider, Tag, Space } from 'antd';
import { FileTextOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export const ReportTab: React.FC = () => {
  return (
    <div style={{ padding: '16px 0', maxWidth: '900px', margin: '0 auto' }}>
      <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button icon={<PrinterOutlined />}>打印报告</Button>
        <Button type="primary" icon={<DownloadOutlined />}>导出 PDF</Button>
      </Space>

      <Card bordered={false} style={{ padding: '24px 48px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ color: 'var(--text-primary)', margin: 0 }}>省级电力市场自动复盘报告</Title>
          <Text type="secondary">报告生成时间: 2026-07-10 23:30 | 报告周期: D-1</Text>
        </div>

        <Divider style={{ borderColor: '#e0e3eb' }} />

        <div style={{ marginBottom: 32 }}>
          <Title level={4}><Tag color="blue">一</Tag> 整体市场供需基本面</Title>
          <Paragraph style={{ fontSize: 16, lineHeight: 1.8, color: '#131722' }}>
            今日全省统调最高负荷达到 <Text style={{ color: '#f23645', fontWeight: 'bold' }}>29,500 MW</Text>，较昨日上涨 4.2%。
            整体供需态势处于 <Text type="danger" strong>偏紧</Text> 状态，特别是 18:00 - 21:00 时段，由于大范围降雨云团导致光伏出力骤降至 0 MW，
            同时气温维持在 35℃ 高位，导致晚间出现了约 <Text style={{ color: '#f23645' }}>3,500 MW</Text> 的深度供需缺口。
          </Paragraph>
        </div>

        <div style={{ marginBottom: 32 }}>
          <Title level={4}><Tag color="blue">二</Tag> 市场价格量价表现</Title>
          <Paragraph style={{ fontSize: 16, lineHeight: 1.8, color: '#131722' }}>
            日前统一结算点均价为 <Text strong>412 元/MWh</Text>，较上一交易日上涨 12%。<br/>
            <ul>
              <li><Text type="danger">最高出清价格</Text>：<Text strong>520 元/MWh</Text> (出现在 19:00)。</li>
              <li><Text type="success">最低出清价格</Text>：<Text strong>310 元/MWh</Text> (出现在 02:00)。</li>
            </ul>
            价格波动曲线完全贴合光伏退坡与晚间用电高峰叠加的双峰形态。
          </Paragraph>
        </div>

        <div style={{ marginBottom: 32 }}>
          <Title level={4}><Tag color="blue">三</Tag> 核心影响因素溯源</Title>
          <Paragraph style={{ fontSize: 16, lineHeight: 1.8, color: '#131722' }}>
            根据多因子皮尔逊相关性矩阵分析，今日高价的三个核心归因：
            <ol>
              <li><b>光伏早退（贡献率 45%）：</b> 辐射强度低于预期，导致晚高峰时段新能源支撑能力断崖式下跌。</li>
              <li><b>空调负荷（贡献率 35%）：</b> 极热天气导致第三产业及居民制冷负荷飙升。</li>
              <li><b>外送挤压（贡献率 20%）：</b> 联络线晚高峰外送计划刚性执行，进一步抽干了省内可用交易空间。</li>
            </ol>
          </Paragraph>
        </div>

        <div style={{ marginBottom: 32 }}>
          <Title level={4}><Tag color="blue">四</Tag> 预测与执行偏差复盘</Title>
          <Paragraph style={{ fontSize: 16, lineHeight: 1.8, color: '#131722' }}>
            <ul>
              <li><b>新能源日前预测偏差：</b> 均方根误差 (RMSE) 为 <Text type="warning">4.2%</Text>，最大偏差发生在 17:15，预测值偏高 800MW。建议修正明日该时段的气象修正系数。</li>
              <li><b>负荷预测偏差：</b> 全天偏差控制在 2% 以内，表现良好。</li>
            </ul>
          </Paragraph>
        </div>

        <div style={{ marginBottom: 32 }}>
          <Title level={4}><Tag color="blue">五</Tag> AI 交易策略优化建议</Title>
          <div style={{ backgroundColor: '#f0f3fa', padding: '16px', borderRadius: '4px', borderLeft: '4px solid var(--primary-color)' }}>
            <Paragraph style={{ fontSize: 15, margin: 0, color: '#131722' }}>
              针对未来三天的相似高温天气，系统模型建议进行以下策略调整：<br/><br/>
              1. <b>日前现货申报：</b> 17:00-22:00 时段放弃博弈，直接以 <Text type="danger">顶格限价</Text> 申报买入，确保物理安全并锁定财务风险。<br/>
              2. <b>日内滚动补充：</b> 密切跟踪中午时段的风电超发情况，若风速大于 6m/s，立刻在滚动交易中卖空多余头寸。<br/>
              3. <b>中长期头寸：</b> 建议立即采购下周 W+1 的双边融合交易合同，补足基荷。
            </Paragraph>
          </div>
        </div>
      </Card>
    </div>
  );
};
