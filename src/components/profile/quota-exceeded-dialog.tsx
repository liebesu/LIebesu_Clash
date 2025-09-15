import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Box,
  Divider,
  Alert,
  LinearProgress,
} from "@mui/material";
import {
  CloudDownloadRounded,
  DeleteRounded,
  WarningRounded,
} from "@mui/icons-material";
import parseTraffic from "@/utils/parse-traffic";
import dayjs from "dayjs";

interface QuotaExceededDialogProps {
  open: boolean;
  profiles: IProfileItem[];
  onClose: () => void;
  onConfirm: (selectedProfiles: string[]) => void;
}

const QuotaExceededDialog: React.FC<QuotaExceededDialogProps> = ({
  open,
  profiles,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 过滤出远程订阅
  const remoteProfiles = profiles.filter((p) => p.type === "remote");

  useEffect(() => {
    if (open) {
      setSelectedProfiles([]);
      setSelectAll(false);
    }
  }, [open]);

  const handleSelectProfile = (uid: string) => {
    setSelectedProfiles((prev) => {
      const newSelected = prev.includes(uid)
        ? prev.filter((id) => id !== uid)
        : [...prev, uid];
      
      setSelectAll(newSelected.length === remoteProfiles.length);
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedProfiles([]);
      setSelectAll(false);
    } else {
      setSelectedProfiles(remoteProfiles.map((p) => p.uid));
      setSelectAll(true);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedProfiles);
  };

  const getProfileTrafficInfo = (profile: IProfileItem): {
    used: string;
    total: string;
    progress: number;
  } | null => {
    const { extra } = profile;
    if (!extra) return null;

    const { upload = 0, download = 0, total = 0 } = extra;
    const used = upload + download;
    const progress = total > 0 ? Math.min(Math.round((used * 100) / total), 100) : 0;

    return {
      used: parseTraffic(used).join(" "),
      total: parseTraffic(total).join(" "),
      progress,
    };
  };

  const getProfileUpdateTime = (profile: IProfileItem) => {
    if (!profile.updated) return t("Never");
    return dayjs(profile.updated * 1000).format("YYYY-MM-DD HH:mm:ss");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "500px" },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningRounded color="warning" />
          <Typography variant="h6">
            {t("Quota Exceeded")}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("Quota exceeded message")}
        </Alert>

        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectAll}
                onChange={handleSelectAll}
                indeterminate={
                  selectedProfiles.length > 0 &&
                  selectedProfiles.length < remoteProfiles.length
                }
              />
            }
            label={t("Select All")}
          />
          <Typography variant="body2" color="textSecondary" sx={{ ml: 4 }}>
            {t("Selected count", { count: selectedProfiles.length, total: remoteProfiles.length })}
          </Typography>
        </Box>

        <Divider sx={{ mb: 1 }} />

        <List dense sx={{ maxHeight: "300px", overflow: "auto" }}>
          {remoteProfiles.map((profile) => {
            const trafficInfo = getProfileTrafficInfo(profile);
            const updateTime = getProfileUpdateTime(profile);
            const isSelected = selectedProfiles.includes(profile.uid);

            return (
              <ListItem
                key={profile.uid}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: isSelected ? "action.selected" : "background.paper",
                }}
              >
                <ListItemIcon>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleSelectProfile(profile.uid)}
                  />
                </ListItemIcon>
                
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                    <CloudDownloadRounded 
                      sx={{ mr: 1, fontSize: 18 }} 
                      color="primary" 
                    />
                    <Typography variant="subtitle2" noWrap>
                      {profile.name || "Unnamed Profile"}
                    </Typography>
                  </Box>

                  {profile.desc && (
                    <Typography variant="body2" color="textSecondary" noWrap sx={{ mb: 0.5 }}>
                      {profile.desc}
                    </Typography>
                  )}

                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      {t("Updated")}: {updateTime}
                    </Typography>
                    
                    {trafficInfo && trafficInfo.total && trafficInfo.total !== "0 B" && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                          {trafficInfo.used} / {trafficInfo.total}
                        </Typography>
                        <Box sx={{ width: 60 }}>
                          <LinearProgress
                            variant="determinate"
                            value={trafficInfo.progress}
                            sx={{ height: 4 }}
                          />
                        </Box>
                        <Typography variant="caption" color="textSecondary">
                          {trafficInfo.progress}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </ListItem>
            );
          })}
        </List>

        {remoteProfiles.length === 0 && (
          <Typography variant="body2" color="textSecondary" sx={{ textAlign: "center", py: 2 }}>
            {t("No remote profiles found")}
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={selectedProfiles.length === 0}
          startIcon={<DeleteRounded />}
        >
          {t("Delete Selected", { count: selectedProfiles.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuotaExceededDialog;
