/**
 * SIMPLE NATIVE PLUGIN EXAMPLE
 *
 * This example demonstrates:
 * 1. Registering a plugin with PluginSDK
 * 2. Using the useApi() hook to call connector tools
 * 3. Handling loading and error states
 * 4. Using theme tokens for styling
 * 5. Providing user feedback with haptics
 *
 * Location: ateam-mobile/src/plugins/example-simple/index.tsx
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { PluginSDK, useApi } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

// ─── TYPES ───────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string;
}

// ─── COMPONENT ───────────────────────────────────────

export default PluginSDK.register('example-simple-tasks', {
  // Metadata
  type: 'ui',
  description: 'Simple task list example',
  version: '1.0.0',

  // Declare native capabilities
  capabilities: {
    haptics: true, // Request haptic feedback
  },

  // The component itself
  Component({ bridge, native, theme }: PluginProps) {
    const api = useApi(bridge);

    // Local state
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Load tasks on mount
    useEffect(() => {
      loadTasks();
    }, []);

    /**
     * Load tasks from connector
     */
    async function loadTasks(isRefresh = false) {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        // Call the connector's tasks.list tool
        const result = await api.call('tasks.list', {
          filter: 'all',
          limit: 50,
        });

        // Result is auto-unwrapped (no MCP envelope)
        setTasks(result.tasks || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load tasks');
        console.error('[Plugin] Load error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }

    /**
     * Mark task as done
     */
    async function completeTask(taskId: string) {
      try {
        // Call connector to update task
        await api.call('tasks.update', {
          id: taskId,
          status: 'done',
        });

        // Haptic feedback
        native.haptics.success();

        // Reload tasks
        await loadTasks();
      } catch (err: any) {
        setError(err.message);
        native.haptics.error();
      }
    }

    // Render loading state
    if (loading) {
      return (
        <View style={[s.center, { backgroundColor: theme.colors.bg }]}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={[s.loadingText, { color: theme.colors.textSecondary }]}>
            Loading tasks...
          </Text>
        </View>
      );
    }

    // Render error state
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
              onPress={() => {
                native.haptics.selection();
                loadTasks();
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>
                Try Again
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // Render task list
    return (
      <View style={[s.container, { backgroundColor: theme.colors.bg }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[s.headerTitle, { color: theme.colors.text }]}>
            Tasks
          </Text>
          <Text style={[s.headerSubtitle, { color: theme.colors.textMuted }]}>
            {tasks.length} items
          </Text>
        </View>

        {/* Empty state */}
        {tasks.length === 0 ? (
          <View style={s.emptyState}>
            <Text
              style={[s.emptyStateIcon, { color: theme.colors.textMuted }]}
            >
              📭
            </Text>
            <Text
              style={[s.emptyStateText, { color: theme.colors.textMuted }]}
            >
              No tasks yet
            </Text>
          </View>
        ) : (
          // Task list
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item: task }) => (
              <Pressable
                style={[
                  s.taskCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderBottomColor: theme.colors.border,
                  },
                ]}
                onPress={() => {
                  native.haptics.selection();
                }}
              >
                {/* Status indicator */}
                <View
                  style={[
                    s.statusDot,
                    {
                      backgroundColor:
                        task.status === 'done'
                          ? theme.colors.success
                          : task.status === 'in_progress'
                            ? theme.colors.accent
                            : theme.colors.textMuted,
                    },
                  ]}
                />

                {/* Content */}
                <View style={s.taskContent}>
                  <Text
                    style={[s.taskTitle, { color: theme.colors.text }]}
                    numberOfLines={2}
                  >
                    {task.title}
                  </Text>

                  {task.description && (
                    <Text
                      style={[
                        s.taskDescription,
                        { color: theme.colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {task.description}
                    </Text>
                  )}

                  {/* Meta */}
                  <View style={s.taskMeta}>
                    {task.status && (
                      <Text
                        style={[
                          s.badgeText,
                          {
                            color: theme.colors.textMuted,
                          },
                        ]}
                      >
                        {task.status.replace('_', ' ').toUpperCase()}
                      </Text>
                    )}
                    {task.assignee && (
                      <Text
                        style={[
                          s.badgeText,
                          {
                            color: theme.colors.accent,
                          },
                        ]}
                      >
                        👤 {task.assignee}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Complete button */}
                {task.status !== 'done' && (
                  <Pressable
                    style={[
                      s.completeButton,
                      { backgroundColor: theme.colors.success },
                    ]}
                    onPress={() => completeTask(task.id)}
                  >
                    <Text style={s.completeButtonText}>✓</Text>
                  </Pressable>
                )}
              </Pressable>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadTasks(true)}
                tintColor={theme.colors.accent}
              />
            }
            contentContainerStyle={s.listContent}
            scrollEnabled={tasks.length > 3}
          />
        )}
      </View>
    );
  },
});

// ─── STYLES ──────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 12,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 8,
  },

  emptyStateText: {
    fontSize: 14,
  },

  listContent: {
    paddingVertical: 8,
  },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },

  taskContent: {
    flex: 1,
  },

  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },

  taskDescription: {
    fontSize: 12,
    marginBottom: 6,
  },

  taskMeta: {
    flexDirection: 'row',
    gap: 8,
  },

  badgeText: {
    fontSize: 10,
    fontWeight: '500',
  },

  completeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  completeButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
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
});
