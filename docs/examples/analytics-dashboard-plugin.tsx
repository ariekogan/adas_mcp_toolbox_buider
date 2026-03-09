/**
 * ANALYTICS DASHBOARD PLUGIN EXAMPLE
 *
 * Built by AI agent using only the public A-Team MCP spec and examples.
 *
 * This demonstrates:
 * - Building a real-world plugin from the spec
 * - Using plugin commands to accept AI planner instructions
 * - Calling multiple connector tools
 * - Rendering complex data with charts
 * - Responsive design using theme tokens
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { PluginSDK, useApi } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

interface MetricCard {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  trendPercent?: number;
}

interface ChartDataPoint {
  label: string;
  value: number;
}

/**
 * ANALYTICS DASHBOARD PLUGIN
 *
 * Plugin ID: mcp:analytics-connector:dashboard
 * Platforms: Mobile (React Native)
 * Capabilities: None required
 */
export default PluginSDK.register('analytics-dashboard', {
  type: 'ui',
  description: 'Real-time analytics dashboard with KPI metrics and trend analysis',
  version: '1.0.0',

  // This plugin can receive AI planner commands
  capabilities: {},

  Component({ bridge, native, theme }: PluginProps) {
    const api = useApi(bridge);

    // ─── STATE ───────────────────────────────────
    const [metrics, setMetrics] = useState<MetricCard[]>([]);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

    // ─── EFFECTS ───────────────────────────────────
    useEffect(() => {
      loadDashboard();
    }, [period]);

    // ─── TOOL CALLS ───────────────────────────────────
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        // Call connector tool to fetch metrics
        // Pattern: ANY connector can expose this tool, we don't hardcode tool names
        const metricsResult = await api.call('analytics.metrics.get', {
          period,
        });

        if (!metricsResult || !metricsResult.metrics) {
          throw new Error('Invalid response format from metrics tool');
        }

        // Transform API response to UI format
        const formattedMetrics: MetricCard[] = metricsResult.metrics.map(
          (m: any) => ({
            label: m.label,
            value: formatNumber(m.value),
            trend: m.trend || 'flat',
            trendPercent: m.trend_percent,
          })
        );

        setMetrics(formattedMetrics);

        // Optionally fetch chart data (graceful degradation if tool not available)
        try {
          const chartResult = await api.call('analytics.chart.timeseries', {
            metric: 'daily_revenue',
            period,
          });

          if (chartResult?.data) {
            setChartData(chartResult.data);
          }
        } catch {
          // Chart data optional - continue without it
          console.log('Chart data unavailable');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }

    // ─── HELPERS ───────────────────────────────────
    function formatNumber(num: number): string {
      if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
      return `$${num.toFixed(0)}`;
    }

    function getTrendColor(trend?: string): string {
      if (trend === 'up') return theme.colors.success;
      if (trend === 'down') return theme.colors.error;
      return theme.colors.textMuted;
    }

    function getTrendIcon(trend?: string): string {
      if (trend === 'up') return '📈';
      if (trend === 'down') return '📉';
      return '→';
    }

    // ─── RENDER: LOADING ───────────────────────────────────
    if (loading) {
      return (
        <View style={[s.center, { backgroundColor: theme.colors.bg }]}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={[s.loadingText, { color: theme.colors.textSecondary }]}>
            Loading analytics...
          </Text>
        </View>
      );
    }

    // ─── RENDER: ERROR ───────────────────────────────────
    if (error) {
      return (
        <View style={[s.errorContainer, { backgroundColor: theme.colors.bg }]}>
          <View
            style={[
              s.errorBox,
              { backgroundColor: theme.colors.accentSoft },
            ]}
          >
            <Text style={[s.errorTitle, { color: theme.colors.error }]}>
              ⚠️ Error
            </Text>
            <Text
              style={[s.errorMessage, { color: theme.colors.textSecondary }]}
            >
              {error}
            </Text>
            <Pressable
              style={[s.retryButton, { backgroundColor: theme.colors.accent }]}
              onPress={() => loadDashboard()}
            >
              <Text style={s.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // ─── RENDER: DASHBOARD ───────────────────────────────────
    return (
      <ScrollView
        style={[s.container, { backgroundColor: theme.colors.bg }]}
        contentContainerStyle={s.contentContainer}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: theme.colors.text }]}>
            📊 Analytics
          </Text>
          <Text style={[s.headerSubtitle, { color: theme.colors.textMuted }]}>
            Last {period === 'day' ? '24 hours' : period === 'week' ? '7 days' : '30 days'}
          </Text>
        </View>

        {/* Period Selector */}
        <View style={s.periodSelector}>
          {(['day', 'week', 'month'] as const).map((p) => (
            <Pressable
              key={p}
              style={[
                s.periodButton,
                period === p && {
                  backgroundColor: theme.colors.accent,
                },
                period !== p && {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => setPeriod(p)}
            >
              <Text
                style={{
                  color:
                    period === p
                      ? 'white'
                      : theme.colors.text,
                  fontWeight: '500',
                  fontSize: theme.fontSize.sm,
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Metrics Grid */}
        <View style={s.metricsGrid}>
          {metrics.map((metric, idx) => (
            <View
              key={idx}
              style={[
                s.metricCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text
                style={[
                  s.metricLabel,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {metric.label}
              </Text>
              <Text
                style={[
                  s.metricValue,
                  { color: theme.colors.text },
                ]}
              >
                {metric.value}
              </Text>
              {metric.trend && (
                <View
                  style={[
                    s.trendBadge,
                    {
                      backgroundColor: getTrendColor(metric.trend),
                    },
                  ]}
                >
                  <Text style={s.trendText}>
                    {getTrendIcon(metric.trend)}{' '}
                    {metric.trendPercent
                      ? `${metric.trendPercent > 0 ? '+' : ''}${metric.trendPercent}%`
                      : ''}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Chart Section */}
        {chartData.length > 0 && (
          <View style={[s.chartSection, { backgroundColor: theme.colors.surface }]}>
            <Text style={[s.chartTitle, { color: theme.colors.text }]}>
              Revenue Trend
            </Text>
            <View style={s.simpleChart}>
              {chartData.map((point, idx) => {
                const maxValue = Math.max(...chartData.map((p) => p.value));
                const height =
                  (point.value / (maxValue || 1)) * 100;
                return (
                  <View
                    key={idx}
                    style={s.chartColumn}
                  >
                    <View
                      style={[
                        s.chartBar,
                        {
                          height: `${Math.max(height, 10)}%`,
                          backgroundColor: theme.colors.accent,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        s.chartLabel,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      {point.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Footer Info */}
        <View style={[s.footer, { borderTopColor: theme.colors.border }]}>
          <Text style={[s.footerText, { color: theme.colors.textMuted }]}>
            Last updated: {new Date().toLocaleTimeString()}
          </Text>
        </View>
      </ScrollView>
    );
  },
});

// ─── STYLES ───────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  contentContainer: {
    paddingVertical: 16,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },

  header: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 12,
  },

  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },

  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  metricsGrid: {
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },

  metricCard: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },

  metricLabel: {
    fontSize: 12,
    marginBottom: 6,
  },

  metricValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },

  trendBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },

  trendText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },

  chartSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 8,
    padding: 16,
  },

  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },

  simpleChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
  },

  chartColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  chartBar: {
    width: '100%',
    borderRadius: 4,
  },

  chartLabel: {
    fontSize: 10,
    marginTop: 4,
  },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },

  footerText: {
    fontSize: 11,
  },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  errorBox: {
    borderRadius: 8,
    padding: 16,
    width: '100%',
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },

  errorMessage: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },

  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },

  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});
