import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";

interface DuplicateGroup {
  url: string;
  items: IProfileItem[];
}

interface DuplicateCleanupDialogProps {
  open: boolean;
  groups: DuplicateGroup[];
  onClose: () => void;
  onConfirm: () => void;
}

const DuplicateCleanupDialog: React.FC<DuplicateCleanupDialogProps> = ({
  open,
  groups,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();

  const renderItemSubtitle = (item: IProfileItem) => {
    const updated = item.updated
      ? dayjs(item.updated * 1000).format("YYYY-MM-DD HH:mm:ss")
      : t("Never");
    return `${t("Updated")}: ${updated}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t("Duplicate subscriptions found")}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {t("Duplicate subscriptions message", { groups: groups.length })}
        </Typography>

        {groups.map((group, index) => (
          <Box key={group.url} sx={{ mb: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Box sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ wordBreak: "break-all" }}>
                {t("Subscription URL")}: {group.url}
              </Typography>
            </Box>
            <Divider />
            <List dense>
              {group.items.map((item) => (
                <ListItem key={item.uid} divider>
                  <ListItemText
                    primary={item.name || t("Unnamed Profile")}
                    secondary={renderItemSubtitle(item)}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}

        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="textSecondary">
            {t("Duplicate cleanup hint")}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("Skip for now")}</Button>
        <Button onClick={onConfirm} variant="contained" color="warning">
          {t("Proceed cleanup (keep newest)")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DuplicateCleanupDialog;


