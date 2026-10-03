const createHandover = async (req, res) => {
  const { narrative_text } = req.body;

  if (!narrative_text) {
    return res.status(400).json({ error: 'narrative_text is required' });
  }

  // Python inference microservice call goes here — later step
  res.json({ message: 'Received', narrative_text });
};

module.exports = { createHandover };