const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── School (tenant) ───────────────────────────────────────────
const SchoolSchema = new Schema({
  slug:         { type: String, required: true, unique: true, lowercase: true, trim: true }, // e.g. "novelty"
  name:         { type: String, required: true },
  address:      { type: String, default: '' },
  phone:        { type: String, default: '' },
  email:        { type: String, default: '' },
  logo:         { type: String, default: '' },
  active:       { type: Boolean, default: true },
  plan:         { type: String, enum: ['trial','starter','growth','premium'], default: 'trial' },
  planExpiry:   { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) }, // 30 day trial
  trialUsed:    { type: Boolean, default: false },
  mnotifyKey:   { type: String, default: '' },
  mnotifySender:{ type: String, default: 'SMS' },
}, { timestamps: true });

// ── Platform Super Admin ──────────────────────────────────────
const SuperAdminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, { timestamps: true });

// ── School User ───────────────────────────────────────────────
const UserSchema = new Schema({
  schoolId:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  username:    { type: String, required: true },
  password:    { type: String, required: true },
  displayName: { type: String, required: true },
  role:        { type: String, enum: ['master', 'admin'], default: 'admin' },
  active:      { type: Boolean, default: true },
}, { timestamps: true });
UserSchema.index({ schoolId: 1, username: 1 }, { unique: true });

// ── Student ───────────────────────────────────────────────────
const StudentSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:         { type: String, required: true },
  name:       { type: String, required: true },
  class_:     { type: String, required: true },
  gender:     { type: String },
  dob:        { type: String },
  parent:     { type: String },
  contact:    { type: String },
  paymode:    { type: String, default: 'Cash' },
  withdrawn:  { type: Boolean, default: false },
  photo:      { type: String, default: '' },
  registered: { type: String },
  t1f: { type: Number, default: 0 }, t1p: { type: Number, default: 0 },
  t2f: { type: Number, default: 0 }, t2p: { type: Number, default: 0 },
  t3f: { type: Number, default: 0 }, t3p: { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  discountNote: { type: String, default: '' },
}, { timestamps: true });
StudentSchema.index({ schoolId: 1, id: 1 }, { unique: true });

// ── Payment ───────────────────────────────────────────────────
const PaymentSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  txn:       { type: String, required: true },
  studentId: { type: String, required: true },
  name:      { type: String },
  class_:    { type: String },
  term:      { type: String },
  mode:      { type: String },
  amount:    { type: Number, required: true },
  date:      { type: String },
  cashier:   { type: String },
  remarks:   { type: String, default: '' },
}, { timestamps: true });
PaymentSchema.index({ schoolId: 1, txn: 1 }, { unique: true });

// ── Staff ─────────────────────────────────────────────────────
const StaffSchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:           { type: String, required: true },
  name:         { type: String, required: true },
  role:         { type: String },
  gender:       { type: String },
  dob:          { type: String },
  contact:      { type: String },
  email:        { type: String, default: '' },
  dateEmployed: { type: String },
  status:       { type: String, default: 'Active' },
  salary:       { type: Number, default: 0 },
  ssnitNo:      { type: String, default: '' },
  otherDeduct:  { type: Number, default: 0 },
  notes:        { type: String, default: '' },
  photo:        { type: String, default: '' },
}, { timestamps: true });
StaffSchema.index({ schoolId: 1, id: 1 }, { unique: true });

// ── Settings (one per school) ─────────────────────────────────
const SettingsSchema = new Schema({
  schoolId:       { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
  schoolName:     { type: String, default: 'My School' },
  address:        { type: String, default: '' },
  phone:          { type: String, default: '' },
  email:          { type: String, default: '' },
  bankName:       { type: String, default: '' },
  bankAccount:    { type: String, default: '' },
  academicYear:   { type: String, default: '2024/2025' },
  currentTerm:    { type: String, default: 'Term 1' },
  proprietor:     { type: String, default: '' },
  proprietorTitle:{ type: String, default: 'Proprietor' },
  schoolInitials: { type: String, default: 'SCH' },
  t1Default:      { type: Number, default: 0 },
  t2Default:      { type: Number, default: 0 },
  t3Default:      { type: Number, default: 0 },
  classFeeRates:  { type: Object, default: {} },
  logo:           { type: String, default: '' },
  mnotifyKey:     { type: String, default: '' },
  mnotifySender:  { type: String, default: 'SMS' },
  smsTemplateReceipt:  { type: String, default: 'Dear {parent}, a payment of {amount} has been received for your ward {name} of {class} for {term}, {year}. Thank you. — {school}' },
  smsTemplateReminder: { type: String, default: 'Dear {parent}, your ward {name} of {class} has an outstanding balance of {balance} for {term}, {year}. Please pay at {school}. Call: {phone}' },
}, { timestamps: true });

// ── Subscription Payment ──────────────────────────────────────
const SubscriptionSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  reference:  { type: String, required: true, unique: true },
  amount:     { type: Number, required: true },
  plan:       { type: String, required: true },
  months:     { type: Number, default: 1 },
  status:     { type: String, enum: ['pending','success','failed'], default: 'pending' },
  paidAt:     { type: Date },
}, { timestamps: true });

// ── Audit ─────────────────────────────────────────────────────
const AuditSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School' },
  time:     { type: String },
  user:     { type: String },
  action:   { type: String },
  detail:   { type: String },
}, { timestamps: true });

// ── Levy Types ───────────────────────────────────────────────
const LevyTypeSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:       { type: String, required: true },
  name:     { type: String, required: true },
  amount:   { type: Number, default: 0 },
  term:     { type: String, default: '' },
  note:     { type: String, default: '' },
}, { timestamps: true });
LevyTypeSchema.index({ schoolId: 1, id: 1 }, { unique: true });

// ── Student Levies ────────────────────────────────────────────
const StudentLevySchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:        { type: String, required: true },
  studentId: { type: String, required: true },
  levyId:    { type: String, required: true },
  levyName:  { type: String, default: '' },
  amount:    { type: Number, default: 0 },
  paid:      { type: Number, default: 0 },
}, { timestamps: true });
StudentLevySchema.index({ schoolId: 1, id: 1 }, { unique: true });

// ── Levy Payments ─────────────────────────────────────────────
const LevyPaymentSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:        { type: String, required: true },
  studentId: { type: String, required: true },
  levyId:    { type: String, required: true },
  amount:    { type: Number, default: 0 },
  date:      { type: String, default: '' },
  cashier:   { type: String, default: '' },
}, { timestamps: true });
LevyPaymentSchema.index({ schoolId: 1, id: 1 }, { unique: true });

// ── School Document ───────────────────────────────────────
const SchoolDocumentSchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  id:           { type: String, required: true },
  title:        { type: String, required: true },
  autoName:     { type: String, default: '' },
  category:     { type: String, default: 'Other' },
  term:         { type: String, default: '' },
  studentId:    { type: String, default: '' },
  studentName:  { type: String, default: '' },
  studentClass: { type: String, default: '' },
  fileName:     { type: String, default: '' },
  fileType:     { type: String, default: '' },
  fileSize:     { type: String, default: '' },
  fileData:     { type: String, default: '' },  // base64
  stamp:        { type: String, default: '' },  // base64 image
  uploadedBy:   { type: String, default: '' },
}, { timestamps: true });
SchoolDocumentSchema.index({ schoolId: 1, id: 1 }, { unique: true });

module.exports = {
  School:        mongoose.model('School',        SchoolSchema),
  SuperAdmin:    mongoose.model('SuperAdmin',    SuperAdminSchema),
  User:          mongoose.model('User',          UserSchema),
  Student:       mongoose.model('Student',       StudentSchema),
  Payment:       mongoose.model('Payment',       PaymentSchema),
  Staff:         mongoose.model('Staff',         StaffSchema),
  Settings:      mongoose.model('Settings',      SettingsSchema),
  Subscription:  mongoose.model('Subscription',  SubscriptionSchema),
  Audit:         mongoose.model('Audit',         AuditSchema),
  LevyType:      mongoose.model('LevyType',      LevyTypeSchema),
  StudentLevy:   mongoose.model('StudentLevy',   StudentLevySchema),
  LevyPayment:   mongoose.model('LevyPayment',   LevyPaymentSchema),
  SchoolDocument:mongoose.model('SchoolDocument',SchoolDocumentSchema),
};
