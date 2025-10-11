import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
} from "@mui/material";
import {
  InfoOutlined,
  DeveloperModeOutlined,
  MemoryOutlined,
  NetworkCheckOutlined,
} from "@mui/icons-material";
import { useClashInfo } from "@/hooks/use-clash";
import { useVerge } from "@/hooks/use-verge";
import { useTranslation } from "react-i18next";

export const SettingVersionInfo: React.FC = () => {
  const { t } = useTranslation();
  const { clashInfo } = useClashInfo();
  const { verge } = useVerge();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
          <InfoOutlined sx={{ mr: 1, color: "primary.main" }} />
          <Typography variant="h6" component="div">
            {t("Version Information")}
          </Typography>
        </Box>

        <Stack spacing={2}>
          {/* Clash 核心信息 */}
          <Box>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <DeveloperModeOutlined
                sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
              />
              <Typography variant="subtitle2" color="text.secondary">
                Clash Core
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1} sx={{ ml: 3 }}>
              <Typography variant="body2">Unknown Version</Typography>
              <Chip
                label={verge?.clash_core || "verge-mihomo"}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Box>
          </Box>

          <Divider />

          {/* 服务器信息 */}
          <Box>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <NetworkCheckOutlined
                sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
              />
              <Typography variant="subtitle2" color="text.secondary">
                External Controller
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ ml: 3 }}>
              {clashInfo?.server || "Not Available"}
            </Typography>
          </Box>

          <Divider />

          {/* 内存使用信息已移除，因为接口中不包含此字段 */}

          {/* 应用版本 */}
          <Box>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              Application Version
            </Typography>
            <Typography variant="body2" sx={{ ml: 0 }}>
              Liebesu Clash v2.4.3
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};
