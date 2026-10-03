const pool = require('../config/db');

async function createNotification({ reportId, recipientId, message }) {
  const result = await pool.query(
    `INSERT INTO notifications (report_id, recipient_id, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [reportId, recipientId || null, message]
  );
  return result.rows[0];
}

async function getNotificationsForUser(userId) {
  const result = await pool.query(
    `SELECT
       n.*,
       (nr.user_id IS NOT NULL) AS is_read,
       nr.read_at
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notif_id = n.notif_id AND nr.user_id = $1
     WHERE n.recipient_id = $1 OR n.recipient_id IS NULL
     ORDER BY n.sent_at DESC`,
    [userId]
  );
  return result.rows;
}

async function markAsRead(notifId, userId) {
  const result = await pool.query(
    `INSERT INTO notification_reads (notif_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (notif_id, user_id) DO UPDATE SET read_at = now()
     RETURNING *`,
    [notifId, userId]
  );
  return result.rows[0];
}

module.exports = { createNotification, getNotificationsForUser, markAsRead };