import React from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from "@mui/material";
import {
  WarningRounded,
  LinkRounded,
  CloudDownloadRounded,
} from "@mui/icons-material";
import dayjs from "dayjs";

interface DuplicateSubscriptionDialogProps {
  open: boolean;
  duplicateProfiles: IProfileItem[];
  newUrl: string;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const DuplicateSubscriptionDialog: React.FC<DuplicateSubscriptionDialogProps> = ({
  open,
  duplicateProfiles,
  newUrl,
  onClose,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  const formatLastUpdate = (timestamp?: number) => {
    if (!timestamp) return t("Never");
    return dayjs(timestamp * 1000).format("YYYY-MM-DD HH:mm:ss");
  };

  const getProfileTypeIcon = (type?: string) => {
    switch (type) {
      case "remote":
        return <CloudDownloadRounded color="primary" />;
      case "local":
        return <LinkRounded color="secondary" />;
      default:
        return <LinkRounded />;
    }
  };

  const getProfileTypeName = (type?: string) => {
    switch (type) {
      case "remote":
        return t("Remote");
      case "local":
        return t("Local");
      case "merge":
        return t("Merge");
      case "script":
        return t("Script");
      default:
        return t("Unknown");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: "400px",
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <WarningRounded color="warning" />
        {t("Duplicate Subscription Detected")}
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            {t("Duplicate subscription message")}
          </Typography>
        </Alert>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t("New Subscription URL")}:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              bgcolor: "background.paper",
              p: 1,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              wordBreak: "break-all",
              fontFamily: "monospace",
              fontSize: "0.875rem",
            }}
          >
            {newUrl}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          {t("Existing Duplicates")} ({duplicateProfiles.length}):
        </Typography>

        <List sx={{ maxHeight: 300, overflow: "auto" }}>
          {duplicateProfiles.map((profile, index) => (
            <React.Fragment key={profile.uid}>
              <ListItem
                sx={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  bgcolor: "background.paper",
                  borderRadius: 1,
                  mb: 1,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    mb: 1,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {getProfileTypeIcon(profile.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle2" noWrap>
                        {profile.name || t("Unnamed Subscription")}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {getProfileTypeName(profile.type)} • 
                        {t("Last Updated")}: {formatLastUpdate(profile.updated)}
                      </Typography>
                    }
                  />
                </Box>
                
                {profile.desc && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1, width: "100%" }}
                  >
                    {profile.desc}
                  </Typography>
                )}

                <Typography
                  variant="caption"
                  sx={{
                    bgcolor: "action.hover",
                    p: 0.5,
                    borderRadius: 0.5,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    width: "100%",
                  }}
                >
                  {profile.url}
                </Typography>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} color="inherit">
          {t("Cancel")}
        </Button>
        <Button onClick={onConfirm} variant="contained" color="warning">
          {t("Add Anyway")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DuplicateSubscriptionDialog;
