import React, { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Tooltip,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  SettingsEthernet,
} from '@mui/icons-material';
import { startCore, stopCore, restartCore } from '@/services/cmds';
import { useClashInfo } from '@/hooks/use-clash';
import { showNotice } from '@/services/noticeService';

export const ServiceControl: React.FC = () => {
  const { clashInfo } = useClashInfo();
  const [loading, setLoading] = useState<string | null>(null);
  
  const isRunning = clashInfo?.server !== undefined && clashInfo?.server !== '';
  
  const handleStart = async () => {
    try {
      setLoading('start');
      await startCore();
      showNotice('success', '服务启动成功', 2000);
    } catch (error: any) {
      console.error('启动服务失败:', error);
      showNotice('error', `启动失败: ${error.message}`, 3000);
    } finally {
      setLoading(null);
    }
  };

  const handleStop = async () => {
    try {
      setLoading('stop');
      await stopCore();
      showNotice('success', '服务停止成功', 2000);
      
      // 🔧 修复：停止后延迟刷新状态，确保状态同步
      setTimeout(() => {
        // 强制重新获取clash状态
        clashInfo && window.dispatchEvent(new CustomEvent('refresh-clash-status'));
      }, 500);
    } catch (error: any) {
      console.error('停止服务失败:', error);
      showNotice('error', `停止失败: ${error.message}`, 3000);
    } finally {
      setLoading(null);
    }
  };

  const handleRestart = async () => {
    try {
      setLoading('restart');
      await restartCore();
      showNotice('success', '服务重启成功', 2000);
    } catch (error: any) {
      console.error('重启服务失败:', error);
      showNotice('error', `重启失败: ${error.message}`, 3000);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Box 
      sx={{ 
        p: 2, 
        borderRadius: 2, 
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        mb: 2
      }}
    >
      {/* 状态显示 */}
      <Box display="flex" alignItems="center" sx={{ mb: 1.5 }}>
        <SettingsEthernet 
          sx={{ 
            mr: 1, 
            color: isRunning ? 'success.main' : 'error.main',
            fontSize: 16
          }} 
        />
        <Typography variant="caption" color="text.secondary">
          服务状态: 
        </Typography>
        <Typography 
          variant="caption" 
          sx={{ 
            ml: 0.5,
            color: isRunning ? 'success.main' : 'error.main',
            fontWeight: 'bold'
          }}
        >
          {isRunning ? '运行中' : '已停止'}
        </Typography>
      </Box>

      {/* 控制按钮 */}
      <ButtonGroup 
        size="small" 
        variant="contained" 
        fullWidth
        sx={{ gap: 0.5 }}
      >
        <Tooltip title="启动服务">
          <span>
            <Button
              onClick={handleStart}
              disabled={isRunning || loading !== null}
              color="success"
              startIcon={
                loading === 'start' ? (
                  <CircularProgress size={14} />
                ) : (
                  <PlayArrow />
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              启动
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="停止服务">
          <span>
            <Button
              onClick={handleStop}
              disabled={!isRunning || loading !== null}
              color="error"
              startIcon={
                loading === 'stop' ? (
                  <CircularProgress size={14} />
                ) : (
                  <Stop />
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              停止
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="重启服务">
          <span>
            <Button
              onClick={handleRestart}
              disabled={loading !== null}
              color="primary"
              startIcon={
                loading === 'restart' ? (
                  <CircularProgress size={14} />
                ) : (
                  <Refresh />
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              重启
            </Button>
          </span>
        </Tooltip>
      </ButtonGroup>
    </Box>
  );
};


