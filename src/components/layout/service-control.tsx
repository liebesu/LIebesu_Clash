import React from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  SettingsEthernet,
} from '@mui/icons-material';
import { startCore, stopCore, restartCore } from '@/services/cmds';
import { useClashInfo } from '@/hooks/use-clash';
import { useUIStateContext } from '@/providers/ui-state-provider';

export const ServiceControl: React.FC = () => {
  const { clashInfo } = useClashInfo();
  const uiState = useUIStateContext();
  
  const isRunning = clashInfo?.server !== undefined && clashInfo?.server !== '';
  const isLoading = uiState.isLoading;
  
  const handleStart = async () => {
    console.log('[ServiceControl] 🚀 用户点击启动服务按钮');
    
    await uiState.executeOperation(
      async () => {
        console.log('[ServiceControl] ⏳ 正在调用startCore API...');
        await startCore();
        console.log('[ServiceControl] ✅ startCore API调用成功');
      },
      {
        loadingMessage: '正在启动服务...',
        successMessage: '服务启动成功',
        errorMessage: '服务启动失败',
        retryable: true,
      }
    ).catch((error) => {
      console.error('[ServiceControl] ❌ 启动服务失败:', error);
    });
  };

  const handleStop = async () => {
    console.log('[ServiceControl] 🛑 用户点击停止服务按钮');
    console.log('[ServiceControl] 当前服务状态:', { isRunning, server: clashInfo?.server });
    
    if (!isRunning) {
      console.log('[ServiceControl] ⚠️ 服务已停止，无需重复操作');
      uiState.success('服务已停止');
      return;
    }
    
    await uiState.executeOperation(
      async () => {
        console.log('[ServiceControl] ⏳ 正在调用stopCore API...');
        
        // 增加超时控制，防止API调用卡死
        const stopPromise = stopCore();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('停止服务超时')), 10000)
        );
        
        await Promise.race([stopPromise, timeoutPromise]);
        console.log('[ServiceControl] ✅ stopCore API调用成功');
        
        // 立即检查状态变化
        console.log('[ServiceControl] 🔍 检查停止后的服务状态...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 多重状态刷新机制
        console.log('[ServiceControl] 🔄 开始多重状态同步...');
        
        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('refresh-clash-status'));
        console.log('[ServiceControl] 📡 已触发自定义刷新事件');
        
        // 延迟再次刷新
        setTimeout(() => {
          console.log('[ServiceControl] 🔄 延迟状态刷新...');
          window.dispatchEvent(new CustomEvent('refresh-clash-status'));
        }, 1000);
        
        // 强制页面刷新（最后手段）
        setTimeout(() => {
          console.log('[ServiceControl] 🔄 强制页面刷新...');
          window.location.reload();
        }, 3000);
      },
      {
        loadingMessage: '正在停止服务...',
        successMessage: '服务停止成功',
        errorMessage: '服务停止失败',
        retryable: true,
        timeout: 15000, // 15秒超时
      }
    ).catch((error) => {
      console.error('[ServiceControl] ❌ 停止服务失败:', error);
    });
  };

  const handleRestart = async () => {
    console.log('[ServiceControl] 🔄 用户点击重启服务按钮');
    console.log('[ServiceControl] 当前服务状态:', { isRunning, server: clashInfo?.server });
    
    await uiState.executeOperation(
      async () => {
        console.log('[ServiceControl] ⏳ 正在调用restartCore API...');
        await restartCore();
        console.log('[ServiceControl] ✅ restartCore API调用成功');
      },
      {
        loadingMessage: '正在重启服务...',
        successMessage: '服务重启成功',
        errorMessage: '服务重启失败',
        retryable: true,
        timeout: 20000, // 重启需要更长时间
      }
    ).catch((error) => {
      console.error('[ServiceControl] ❌ 重启服务失败:', error);
    });
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
              disabled={isRunning || isLoading}
              color="success"
              startIcon={<PlayArrow />}
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
              disabled={!isRunning || isLoading}
              color="error"
              startIcon={<Stop />}
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
              disabled={isLoading}
              color="primary"
              startIcon={<Refresh />}
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


