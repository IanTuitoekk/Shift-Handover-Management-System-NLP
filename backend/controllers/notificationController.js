const { getNotificationsForUser, markAsRead } = require('../models/notificationModel');

const listNotifications = async (req, res) => {
  try {
    const notifications = await getNotificationsForUser(req.user.userId);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

const markRead = async (req, res) => {
  const { notifId } = req.params;
  try {
    const result = await markAsRead(notifId, req.user.userId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

module.exports = { listNotifications, markRead };