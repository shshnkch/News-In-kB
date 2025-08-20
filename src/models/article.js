// src/models/article.js
const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true, trim: true, maxlength: 300 },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },

    // Use required+unique+index for fast upsert/dedupe
    link:    { type: String, required: true, trim: true, unique: true, index: true },

    source:  { type: String, required: true, trim: true, maxlength: 120 },

    // Keep both pubDate (from feed) and createdAt (ingest time)
    pubDate: { type: Date, index: true },

    image:   { type: String, trim: true, maxlength: 2000 },

    // TTL: delete 24h after insertion
    createdAt: { type: Date, default: Date.now, expires: 86400, index: true },
  },
  {
    versionKey: false,
    minimize: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        // keep id but remove Mongo internals as its not needed
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Helpful compound index for feeds/pages sorted by newest per source
articleSchema.index({ source: 1, pubDate: -1 });

// Basic URL sanity (non-blocking; avoids junk)
articleSchema.path('link').validate(val => /^https?:\/\//i.test(val), 'link must be http(s) URL');
articleSchema.path('image').validate(val => !val || /^https?:\/\//i.test(val), 'image must be http(s) URL');

module.exports = mongoose.model('Article', articleSchema);
