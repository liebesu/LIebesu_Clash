import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  Box,
  Divider,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { Warning } from "@mui/icons-material";
// IProfileItem is declared globally in src/services/types.d.ts

interface DuplicateSubscriptionDialogProps {
  open: boolean;
  duplicateProfiles: IProfileItem[];
  newUrl: string;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const DuplicateSubscriptionDialog: React.FC<
  DuplicateSubscriptionDialogProps
> = ({ open, duplicateProfiles, newUrl, onClose, onConfirm, onCancel }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Warning color="warning" />
          <Typography variant="h6">
            {t("Duplicate Subscription Detected")}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" gutterBottom>
          {t("This subscription URL already exists in the following profiles")}:
        </Typography>

        <List
          dense
          sx={{ bgcolor: "background.paper", borderRadius: 1, my: 1 }}
        >
          {duplicateProfiles.map((profile, index) => (
            <ListItem
              key={profile.uid}
              divider={index < duplicateProfiles.length - 1}
            >
              <ListItemText
                primary={profile.name || t("Unnamed Profile")}
                secondary={
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ wordBreak: "break-all" }}
                  >
                    {profile.url}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary">
          <strong>{t("New URL")}:</strong>
        </Typography>
        <Typography
          variant="body2"
          sx={{
            wordBreak: "break-all",
            mt: 1,
            p: 1,
            bgcolor: "action.hover",
            borderRadius: 1,
          }}
        >
          {newUrl}
        </Typography>

        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: "warning.main",
            color: "warning.contrastText",
            borderRadius: 1,
          }}
        >
          <Typography variant="body2">
            {t(
              "Adding duplicate subscriptions may cause conflicts or unnecessary resource usage. Are you sure you want to continue?",
            )}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
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
