require('dotenv').config();

// ===== Modules =====
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer");
const axios = require("axios");

// ===== Env vars =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.CHAT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;
if(!FRONTEND_URL) console.warn("⚠️ FRONTEND_URL chưa được cấu hình trong .env!");

// ===== Cloudinary config =====
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// ===== Nodemailer config =====
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

// ===== Multer memory storage =====
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===== Upload function =====
function uploadToCloudinary(fileBuffer, folder = "fruitshop") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if(error) return reject(error);
      resolve(result);
    });
    stream.end(fileBuffer);
  });
}

// ===== Express app =====
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(()=>console.log("MongoDB connected"))
  .catch(err=>console.log(err));

// ===== Schemas =====
const fruitSchema = new mongoose.Schema({
  name: String,
  price: Number,
  unit: String,
  image: String,
  description: String,
  category: String,
  thumbs: { type: [String], default: [] }
});
const Fruit = mongoose.model("Fruit", fruitSchema);

const userSchema = new mongoose.Schema({
  username:{type:String, unique:true},
  password:String,
  role:{type:String, default:"user"}
});
const User = mongoose.model("User", userSchema);

const bannerSchema = new mongoose.Schema({
  image: String,
  createdAt: { type: Date, default: Date.now }
});
const Banner = mongoose.model("Banner", bannerSchema);

const orderSchema = new mongoose.Schema({
  orderCode: String,
  name: String,
  phone: String,
  email: String,
  address: String,
  note: String,
  total: Number,
  cart: Array,
  status: { type:String, default:"pending" },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", orderSchema);

// ===== Telegram helpers =====
async function sendTelegram(text){
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,{
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode:"HTML"
    });
  } catch(err){ console.log("Telegram error:", err.message); }
}
async function sendTelegramPhoto(photo, caption){
  try{
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,{
      chat_id: TELEGRAM_CHAT_ID,
      photo,
      caption,
      parse_mode:"HTML"
    });
  } catch(err){ console.log("Telegram photo error:", err.message); }
}

// ===== Utils =====
const removeVietnameseTones = str => {
  if(!str) return "";
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  str = str.replace(/đ/g,"d").replace(/Đ/g,"D");
  return str.toLowerCase().trim().replace(/\s+/g," ");
};

// ===== Routes =====

// --------- Fruits ---------
app.get("/api/fruits", async (req,res)=>{
  try{ const fruits = await Fruit.find().sort({_id:-1}).lean(); res.json(fruits); }
  catch(err){ res.status(500).json({error:err.message}); }
});

app.get("/api/fruits/product/:id", async (req,res)=>{
  try{ 
    const product = await Fruit.findById(req.params.id);
    if(!product) return res.status(404).json({error:"Không tìm thấy sản phẩm"});
    res.json(product);
  } catch(err){ res.status(500).json({error:err.message}); }
});

// Search products
app.get("/api/search", async (req,res)=>{
  try{
    const q = req.query.q?.trim() || "";
    if(!q) return res.json([]);
    const products = await Fruit.find({ name: { $regex: q, $options:"i" } });
    res.json(products || []);
  } catch(err){ res.status(500).json({error:err.message}); }
});

// Upload fruit (admin)
app.post("/api/upload", upload.single("image"), async (req,res)=>{
  try{
    const { name, price, category, description, username, unit } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin"});
    if(!name || !price) return res.status(400).json({error:"Thiếu tên hoặc giá"});
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"});

    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/products");
    const fruit = new Fruit({
      name,
      price,
      unit: unit || "Chưa có",
      category: category ? category.toLowerCase() : "",
      description,
      image: result.secure_url
    });
    await fruit.save();
    res.json(fruit);
  } catch(err){ res.status(500).json({error:err.message}); }
});

// Delete fruit (admin)
app.delete("/api/fruits/:id", async (req,res)=>{
  try{
    const { username } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin"});
    const fruit = await Fruit.findById(req.params.id);
    if(!fruit) return res.status(404).json({error:"Not found"});

    if(fruit.image?.includes("cloudinary")){
      const file = fruit.image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy("fruitshop/products/" + file);
    }

    for(const t of fruit.thumbs){
      const file = t.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy("fruitshop/thumbs/" + file);
    }

    await Fruit.findByIdAndDelete(req.params.id);
    res.json({message:"Deleted"});
  } catch(err){ res.status(500).json({error:err.message}); }
});

// Update description (admin)
app.put("/api/fruits/:id/description", async (req,res)=>{
  try{
    const { username, description } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({success:false,message:"Chỉ admin"});
    const updated = await Fruit.findByIdAndUpdate(req.params.id,{description},{new:true});
    if(!updated) return res.status(404).json({success:false,message:"Không tìm thấy sản phẩm"});
    res.json({success:true, product: updated});
  } catch(err){ res.status(500).json({success:false,message:err.message}); }
});

// Upload thumb
app.post("/api/fruits/:id/thumb", upload.single("thumb"), async (req,res)=>{
  try{
    const { username } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({success:false,message:"Chỉ admin"});
    const fruit = await Fruit.findById(req.params.id);
    if(!fruit) return res.status(404).json({success:false,message:"Không tìm thấy sản phẩm"});
    if(!req.file) return res.status(400).json({success:false,message:"Chưa chọn file"});

    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/thumbs");
    fruit.thumbs.push(result.secure_url);
    await fruit.save();
    res.json({success:true, product: fruit});
  } catch(err){ res.status(500).json({success:false,message:err.message}); }
});

// Delete thumb
app.delete("/api/fruits/:id/thumb", async (req,res)=>{
  try{
    const { username, image } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({message:"Chỉ admin"});
    const fruit = await Fruit.findById(req.params.id);
    if(!fruit) return res.status(404).json({message:"Không tìm thấy sản phẩm"});

    if(image?.includes("cloudinary")){
      const file = image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy("fruitshop/thumbs/" + file);
    }

    fruit.thumbs = fruit.thumbs.filter(t => t!==image);
    await fruit.save();
    res.json({success:true});
  } catch(err){ res.status(500).json({message:"Lỗi xoá ảnh"}); }
});

// --------- Banner ---------
app.post("/api/banner/upload", upload.single("image"), async (req,res)=>{
  try{
    const { username } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin"});
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"});

    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/banners");
    const banner = new Banner({ image: result.secure_url });
    await banner.save();
    res.json({success:true, banner});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.get("/api/banners", async (req,res)=>{
  try{ const banners = await Banner.find().sort({createdAt:-1}); res.json(banners); }
  catch(err){ res.status(500).json({error:err.message}); }
});

app.delete("/api/banner/:id", async (req,res)=>{
  try{
    const banner = await Banner.findById(req.params.id);
    if(!banner) return res.status(404).json({error:"Not found"});
    await Banner.findByIdAndDelete(req.params.id);
    res.json({success:true});
  } catch(err){ res.status(500).json({error:err.message}); }
});

// --------- Orders ---------
app.get("/api/orders", async (req,res)=>{
  try{
    const orders = await Order.find().sort({createdAt:-1});
    res.json(orders);
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.put("/api/orders/:id/status", async (req,res)=>{
  try{
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id,{status},{new:true});
    res.json(order);
  } catch(err){ res.status(500).json({error:err.message}); }
});

// Create order
app.post("/api/order", async (req,res)=>{
  try{
    const { name, phone, email, address, note, total, cart } = req.body;
    const orderCode = "DH" + Date.now();
    const order = new Order({ orderCode,name,phone,email,address,note,total,cart });
    await order.save();

    // Telegram
    let cartText = cart.map(p=>`- ${p.name} x${p.qty} = ${(p.price*p.qty).toLocaleString()} VND`).join("\n");
    const message = `🛒 ĐƠN HÀNG MỚI\n\n📦 Mã đơn: ${orderCode}\n👤 Khách: ${name}\n📞 ${phone}\n📍 ${address}\n\n${cartText}\n💰 Tổng: ${total.toLocaleString()} VND`;
    await sendTelegram(message);

    for(const p of cart){
      const caption = `🛒 ${p.name}\nSL: ${p.qty}\nGiá: ${(p.price*p.qty).toLocaleString()} VND`;
      if(p.image) await sendTelegramPhoto(p.image, caption);
    }

    // Email
    const cartHtml = `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Sản phẩm</th><th>Đơn vị</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
      <tbody>${cart.map(p=>`<tr><td>${p.name}</td><td>${p.unit||1}</td><td>${p.qty}</td><td>${(p.price*p.qty).toLocaleString()}</td></tr>`).join('')}</tbody>
    </table>
    <p><b>Tổng tiền:</b> ${total.toLocaleString()} VND</p>
    <p><b>Ghi chú:</b> ${note||"Không có"}</p>`;

    const orderLink = `${FRONTEND_URL}/order/${order._id}`;
    await transporter.sendMail({
      from:`"Fruit Shop" <${process.env.GMAIL_USER}>`,
      to:"lanvihuynh79@gmail.com",
      subject:`Đơn hàng mới từ ${name}`,
      html:`<h3>Thông tin khách hàng</h3>
        <p><b>Họ tên:</b> ${name}</p>
        <p><b>Điện thoại:</b> ${phone}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Địa chỉ:</b> ${address}</p>
        <h3>Giỏ hàng</h3>${cartHtml}
        <p><b>Xem chi tiết:</b> <a href="${orderLink}" target="_blank">${orderLink}</a></p>`
    });

    res.json({success:true,message:"Đơn hàng đã gửi và lưu thành công"});
  } catch(err){ res.status(500).json({success:false,message:err.message}); }
});

// View order detail (HTML)
app.get("/order/:id", async (req,res)=>{
  try{
    const order = await Order.findById(req.params.id).lean();
    if(!order) return res.status(404).send("Không tìm thấy đơn hàng");

    let cartHtml = `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width:100%">
      <thead><tr><th>Hình ảnh</th><th>Sản phẩm</th><th>Đơn vị</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
      <tbody>${order.cart.map(p=>`<tr>
        <td><img src="${p.image||'https://via.placeholder.com/60'}" width="60"/></td>
        <td>${p.name}</td>
        <td>${p.unit||1}</td>
        <td>${p.qty}</td>
        <td>${(p.price*p.qty).toLocaleString()}</td>
      </tr>`).join('')}</tbody>
    </table>`;

    res.send(`<h2>Chi tiết đơn hàng</h2>
      <p><b>Họ tên:</b> ${order.name}</p>
      <p><b>Điện thoại:</b> ${order.phone}</p>
      <p><b>Email:</b> ${order.email}</p>
      <p><b>Địa chỉ:</b> ${order.address}</p>
      <h3>Giỏ hàng</h3>${cartHtml}
      <p><b>Ghi chú:</b> ${order.note||"Không có"}</p>`);
  } catch(err){ res.status(500).send("Lỗi server"); }
});

// --------- Auth ---------
app.post("/api/register", async (req,res)=>{
  try{
    const { username, password } = req.body;
    if(await User.findOne({ username })) return res.json({success:false,message:"Username đã tồn tại"});
    const role = (await User.countDocuments({})===0) ? "admin" : "user";
    const user = new User({ username,password,role });
    await user.save();
    res.json({success:true});
  } catch(err){ res.status(500).json({success:false,message:err.message}); }
});

app.post("/api/login", async (req,res)=>{
  try{
    const { username,password } = req.body;
    const user = await User.findOne({ username,password });
    if(!user) return res.json({success:false,message:"Sai username hoặc password"});
    res.json({success:true, role:user.role});
  } catch(err){ res.status(500).json({success:false,message:err.message}); }
});

// ===== Run server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on port "+PORT));