'use strict';

const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Note', noteSchema);
