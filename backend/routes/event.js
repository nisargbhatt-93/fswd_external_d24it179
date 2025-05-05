const express = require('express');
const router = express.Router();
const Event = require('./models/Event');
const authMiddleware = require('./middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup multer for image uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// List all events with optional search query by title or type
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    let filter = {};
    if (search) {
      const re = new RegExp(search, 'i');
      filter = { $or: [{ title: re }, { type: re }] };
    }
    const events = await Event.find(filter).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get event details by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new event
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, type, description, date, location } = req.body;
    if (!title || !type || !description || !date) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }
    const event = new Event({
      title,
      type,
      description,
      date,
      location,
      imageUrl,
      createdBy: req.user.id,
    });
    await event.save();
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit event
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this event' });
    }

    const { title, type, description, date, location } = req.body;
    if (title) event.title = title;
    if (type) event.type = type;
    if (description) event.description = description;
    if (date) event.date = date;
    if (location) event.location = location;

    if (req.file) {
      // Delete old image if exists
      if (event.imageUrl) {
        const oldImagePath = path.join(__dirname, '..', event.imageUrl);
        fs.unlink(oldImagePath, err => {
          if (err) console.error('Failed to delete old image', err);
        });
      }
      event.imageUrl = `/uploads/${req.file.filename}`;
    }

    await event.save();
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete event
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this event' });
    }

    // Delete image if exists
    if (event.imageUrl) {
      const imagePath = path.join(__dirname, '..', event.imageUrl);
      fs.unlink(imagePath, err => {
        if (err) console.error('Failed to delete image', err);
      });
    }

    await event.remove();
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
