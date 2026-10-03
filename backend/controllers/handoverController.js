const { processHandover } = require('../services/handoverService');

const createHandover = async (req, res) => {
  const { narrative_text, input_type, language_variant, shift } = req.body;

  if (!narrative_text) {
    return res.status(400).json({ error: 'narrative_text is required' });
  }

  try {
    const result = await processHandover({
      userId: req.user.userId,
      inputType: input_type || 'text',
      content: narrative_text,
      languageVariant: language_variant || null,
      shift: shift || null,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process handover' });
  }
};

module.exports = { createHandover };