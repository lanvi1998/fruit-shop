require('dotenv').config();
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.CHAT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL) {
  console.warn("⚠️ FRONTEND_URL chưa được cấu hình trong .env!");
}

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});
// ===== Modules =====
const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const multer = require("multer")
const cloudinary = require("cloudinary").v2
const nodemailer = require("nodemailer")
//
const axios = require("axios")
// const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
// const TELEGRAM_CHAT_ID = process.env.CHAT_ID

// gửi text
async function sendTelegram(text){
  try{
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,{
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode:"HTML"
    })
  }catch(err){
    console.log("Telegram error:", err.message)
  }
}

// gửi ảnh
async function sendTelegramPhoto(photo, caption){
  try{
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,{
      chat_id: TELEGRAM_CHAT_ID,
      photo: photo,
      caption: caption,
      parse_mode:"HTML"
    })
  }catch(err){
    console.log("Telegram photo error:", err.message)
  }
}

// ===== Cloudinary config =====
// cloudinary.config({
//   cloud_name: process.env.CLOUD_NAME,
//   api_key: process.env.CLOUD_API_KEY,
//   api_secret: process.env.CLOUD_API_SECRET
// })

// ===== Multer memory storage =====
const storage = multer.memoryStorage()
const upload = multer({ storage })

// ===== Upload function =====
function uploadToCloudinary(fileBuffer, folder = "fruitshop") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error)
        resolve(result)
      }
    )
    stream.end(fileBuffer)
  })
}

// ===== Express app =====
const app = express()
app.use(express.json())
app.use(cors())
app.use(express.static("public"))

// ===== MongoDB =====
mongoose.connect("mongodb://lanvi:lanvi98@ac-yeq62ge-shard-00-00.lxr0whp.mongodb.net:27017,ac-yeq62ge-shard-00-01.lxr0whp.mongodb.net:27017,ac-yeq62ge-shard-00-02.lxr0whp.mongodb.net:27017/fruitshop?ssl=true&replicaSet=atlas-8oee57-shard-0&authSource=admin&retryWrites=true&w=majority")
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))

// ===== Schemas =====
const fruitSchema = new mongoose.Schema({
  name: String,
  price: Number,
  unit: String,          
  image: String,
  description: String,
  category: String,
  thumbs: { type: [String], default: [] } // Thêm dòng này
});
const Fruit = mongoose.model("Fruit", fruitSchema)

const userSchema = new mongoose.Schema({
  username:{type:String, unique:true},
  password:String,
  role:{type:String, default:"user"} // "admin" hoặc "user"
})
const User = mongoose.model("User", userSchema)

// Banner
const bannerSchema = new mongoose.Schema({
  image: String,
  createdAt: { type: Date, default: Date.now }
})
const Banner = mongoose.model("Banner", bannerSchema)

// Order Schema



const orderSchema = new mongoose.Schema({
  orderCode: String,
  name: String,
  phone: String,
  email: String,
  address: String,
  note: String,
  total: Number,
  cart: Array,
  status: { type:String, default:"pending" }, // pending | confirmed | delivered
  createdAt: { type: Date, default: Date.now }
})

const Order = mongoose.model("Order", orderSchema)

//
// ===== GET ALL ORDERS =====
app.get("/api/orders", async (req,res)=>{
  try{
    const orders = await Order.find().sort({createdAt:-1})
    res.json(orders)
  }catch(err){
    res.status(500).json({error:err.message})
  }
})
// ===== UPDATE ORDER STATUS =====
app.put("/api/orders/:id/status", async (req,res)=>{
  try{
    const { status } = req.body

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new:true }
    )

    res.json(order)
  }catch(err){
    res.status(500).json({error:err.message})
  }
})


// ===== GET tất cả sản phẩm =====
app.get("/api/fruits", async (req,res)=>{
  try{
    const fruits = await Fruit.find().sort({_id:-1}).lean()
    res.json(fruits)
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

// ===== DELETE sản phẩm (admin only) =====
app.delete("/api/fruits/:id", async (req,res)=>{
  try{
    const { username } = req.body

    const user = await User.findOne({ username })
    if(!user || user.role!=="admin")
      return res.status(403).json({error:"Chỉ admin mới được phép"})

    const fruit = await Fruit.findById(req.params.id)
    if(!fruit)
      return res.status(404).json({error:"Not found"})

    // ===== XOÁ ẢNH CHÍNH CLOUDINARY =====
    if(fruit.image && fruit.image.includes("cloudinary")){
      const parts = fruit.image.split("/")
      const file = parts[parts.length - 1]
      const publicId = "fruitshop/products/" + file.split(".")[0]
    
      await cloudinary.uploader.destroy(publicId)
    }

    // ===== XOÁ THUMBNAILS =====
    if(fruit.thumbs && fruit.thumbs.length){
      for(const t of fruit.thumbs){
        const fileName = t.split("/").pop().split(".")[0]
        await cloudinary.uploader.destroy("fruitshop/thumbs/" + fileName)
      }
    }

    await Fruit.findByIdAndDelete(req.params.id)

    res.json({message:"Deleted"})

  }catch(err){
    console.error(err)
    res.status(500).json({error:err.message})
  }
})

// ===== Upload sản phẩm (admin only) =====
app.post("/api/upload", upload.single("image"), async (req,res)=>{
  try{
    const { name, price, category, description, username, unit } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin mới được phép"});
    
    if(!name || !price)
      return res.status(400).json({error:"Thiếu tên hoặc giá"})
    if(!req.file) 
      return res.status(400).json({error:"Chưa chọn ảnh"})

    

    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/products");
    const fruit = new Fruit({
      name,
      price,
      unit: unit || "Chưa có",  // ✅ nếu admin không nhập, mặc định "Chưa có"
      category: category ? category.toLowerCase() : "",
      description,
      image: result.secure_url
    });
    await fruit.save();
    res.json(fruit);
  }catch(err){
    console.log(err);
    res.status(500).json({error:err.message});
  }
});

// ===== REGISTER =====
app.post("/api/register", async (req,res)=>{
  try{
    const { username, password } = req.body
    if(await User.findOne({ username })) return res.json({success:false,message:"Username đã tồn tại"})
    const role = (await User.countDocuments({})===0) ? "admin" : "user"
    const user = new User({ username, password, role })
    await user.save()
    res.json({success:true})
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

// ===== LOGIN =====
app.post("/api/login", async (req,res)=>{
  try{
    const { username, password } = req.body
    const user = await User.findOne({ username, password })
    if(!user) return res.json({success:false,message:"Sai username hoặc password"})
    res.json({success:true, role:user.role})
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

// ===== Banner =====
app.post("/api/banner/upload", upload.single("image"), async (req,res)=>{
  try {
    const { username } = req.body
    const user = await User.findOne({ username })
    if(!user || user.role !== "admin") return res.status(403).json({error:"Chỉ admin mới được phép"})
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"})

    // Upload lên Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/banners")
    
    const banner = new Banner({
      image: result.secure_url
    })
    await banner.save()
    res.json({success:true, banner})
  } catch(err) {
    console.error(err)
    res.status(500).json({error:err.message})
  }
})
app.get("/api/banners", async (req,res)=>{
  try{
    const banners = await Banner.find().sort({createdAt:-1})
    res.json(banners)
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

app.delete("/api/banner/:id", async (req,res)=>{
  try{
    const { id } = req.params
    const banner = await Banner.findById(id)
    if(!banner) return res.status(404).json({error:"Not found"})
     
    await Banner.findByIdAndDelete(id)
    res.json({success:true})
  }catch(err){
    res.status(500).json({error:err.message})
  }
})


    // Lưu order
    
      
      app.post("/api/order", async (req, res) => {
        try {
      
          const { name, phone, email, address, note, total, cart } = req.body;
      
          // ===== TẠO MÃ ĐƠN =====
const count = await Order.countDocuments()
const orderCode = "DH" + Date.now()

// Lưu order
const order = new Order({
  orderCode,
  name,
  phone,
  email,
  address,
  note,
  total,
  cart
})

await order.save()
        // ===== GỬI TELEGRAM =====
let cartText = cart.map(p =>
  `- ${p.name} x${p.qty} = ${(p.price*p.qty).toLocaleString()} VND`
  ).join("\n")
  
  const message = `
🛒 ĐƠN HÀNG MỚI

📦 Mã đơn: ${orderCode}

👤 Khách: ${name}
📞 ${phone}
📍 ${address}

${cartText}

💰 Tổng: ${total.toLocaleString()} VND
`
  
  await sendTelegram(message)
  // ===== GỬI ẢNH SẢN PHẨM TELEGRAM =====
for(const p of cart){

  const caption = `
🛒 ${p.name}
SL: ${p.qty}
Giá: ${(p.price*p.qty).toLocaleString()} VND
`

  if(p.image){
    await sendTelegramPhoto(p.image, caption)
  }

}
  

    
        // ===== URL frontend để admin click =====
      
    
        // Tạo HTML giỏ hàng với link sản phẩm
        const cartHtml = `
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
<thead>
<tr>
<th>Sản phẩm</th>
<th>Đơn vị</th>
<th>Số lượng</th>
<th>Thành tiền (VND)</th>
</tr>
</thead>
<tbody>
${cart.map(p => `
<tr>
<td>${p.name || ''}</td>
<td>${p.unit || '1'}</td>
<td>${p.qty || 0}</td>
<td>${((p.price||0)*(p.qty||0)).toLocaleString()}</td>
</tr>
`).join('')}
</tbody>
</table>

<p><b>Tổng tiền:</b> ${(total||0).toLocaleString()} VND</p>
<p><b>Ghi chú:</b> ${note || "Không có"}</p>
`;
          
    
        // Link chi tiết đơn hàng admin có thể click
        const orderLink = `${FRONTEND_URL}/order/${order._id}`;
    
        // ===== Mailer =====
        // const transporter = nodemailer.createTransport({
        //   service: "gmail",
        //   auth: {
        //     user: process.env.GMAIL_USER,
        //     pass: process.env.GMAIL_PASS
        //   },
        //   tls: { rejectUnauthorized: false }  // <-- quan trọng
        // });
    
        // Gửi mail
        const info = await transporter.sendMail({
          from: `"Fruit Shop" <${process.env.GMAIL_USER}>`,
          to: "lanvihuynh79@gmail.com",
          subject: `Đơn hàng mới từ ${name}`,
          html: `
            <h3>Thông tin khách hàng</h3>
            <p><b>Họ tên:</b> ${name}</p>
            <p><b>Điện thoại:</b> ${phone}</p>
            <p><b>Email:</b> ${email}</p>
            <p><b>Địa chỉ:</b> ${address}</p>
            <h3>Giỏ hàng</h3>
            ${cartHtml}
            <p><b>Xem chi tiết đơn hàng:</b> <a href="${orderLink}" target="_blank">${orderLink}</a></p>
          `
        });
    
        console.log("Mail đã gửi:", info.messageId);
        res.json({ success: true, message: "Đơn hàng đã gửi và lưu thành công" });
    
      } catch(err) {
        console.error("Lỗi gửi mail:", err);
        res.status(500).json({ success: false, message: "Gửi đơn hàng thất bại" });
      }
    });
// API tìm kiếm sản phẩm
// Hàm bỏ dấu tiếng Việt
const removeVietnameseTones = (str) => {
  if (!str) return "";
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/đ/g, "d").replace(/Đ/g, "D");
  str = str.toLowerCase();
  str = str.trim().replace(/\s+/g, " ");
  return str;
};

// Tìm sản phẩm theo tên (không phân biệt hoa/thường và dấu)
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    if (!q) return res.json([]);

    const products = await Fruit.find({
      name: { $regex: q, $options: "i" }   // tìm không phân biệt hoa thường
    });

    res.json(products || []);

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ===== GET 1 sản phẩm theo ID =====
app.get("/api/fruits/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Fruit.findById(id);
    if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// ===== UPDATE description sản phẩm (admin only) =====
app.put("/api/fruits/:id/description", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, description } = req.body;

    // Kiểm tra quyền admin
    const user = await User.findOne({ username });
    if(!user || user.role !== "admin") 
      return res.status(403).json({success:false, message:"Chỉ admin mới được phép"});

    // Cập nhật mô tả
    const updated = await Fruit.findByIdAndUpdate(
      id,
      { description },
      { new: true }
    );

    if(!updated) return res.status(404).json({success:false, message:"Không tìm thấy sản phẩm"});

    res.json({success:true, product: updated});
  } catch(err) {
    console.error(err);
    res.status(500).json({success:false, message:err.message});
  }
});
// Express route ví dụ:
// Express route upload thumbnail (server.js)
// ===== UPLOAD THUMB =====
app.post("/api/fruits/:id/thumb", upload.single("thumb"), async (req,res)=>{
  try {
    const { username } = req.body
    const user = await User.findOne({ username })
    if(!user || user.role !== "admin") return res.status(403).json({success:false,message:"Chỉ admin"})

    const fruit = await Fruit.findById(req.params.id)
    if(!fruit) return res.status(404).json({success:false,message:"Không tìm thấy sản phẩm"})
    if(!req.file) return res.status(400).json({success:false,message:"Chưa chọn file"})

    const result = await uploadToCloudinary(req.file.buffer, "fruitshop/thumbs")
    if(!fruit.thumbs) fruit.thumbs = []
    fruit.thumbs.push(result.secure_url)

    await fruit.save()
    res.json({success:true, product: fruit})
  } catch(err) {
    console.error(err)
    res.status(500).json({success:false,message:err.message})
  }
})

// ===== DELETE THUMB =====
// ===== DELETE THUMB =====
// ===== DELETE THUMB =====
app.delete("/api/fruits/:id/thumb", async (req,res)=>{
  try{

    const { username, image } = req.body;

    const user = await User.findOne({ username });
    if(!user || user.role !== "admin"){
      return res.status(403).json({message:"Chỉ admin"});
    }

    const fruit = await Fruit.findById(req.params.id);
    if(!fruit){
      return res.status(404).json({message:"Không tìm thấy sản phẩm"});
    }

    // ===== XOÁ CLOUDINARY =====
    if(image && image.includes("cloudinary")){
      const file = image.split("/").pop().split(".")[0];
      const publicId = "fruitshop/thumbs/" + file;

      await cloudinary.uploader.destroy(publicId);
    }

    // ===== XOÁ DATABASE =====
    fruit.thumbs = fruit.thumbs.filter(t => t !== image);
    await fruit.save();

    res.json({success:true});

  }catch(err){
    console.error(err);
    res.status(500).json({message:"Lỗi xoá ảnh"});
  }
});
// Xem chi tiết đơn hàng
app.get("/order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).lean();
    if(!order) return res.status(404).send("Không tìm thấy đơn hàng");

    // HTML giỏ hàng
    let cartHtml = `
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Hình ảnh</th>
            <th>Sản phẩm</th>
            <th>Đơn vị</th>
            <th>Số lượng</th>
            <th>Thành tiền (VND)</th>
          </tr>
        </thead>
        <tbody>
          ${order.cart.map(p => `
            <tr>
              <td><img src="${p.image || 'https://via.placeholder.com/60'}" width="60"></td>
              <td>${p.name || ''}</td>
              <td>${p.unit || '1'}</td>
              <td>${p.qty || 0}</td>
              <td>${((p.price || 0)*(p.qty || 0)).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p><b>Tổng tiền:</b> ${(order.total||0).toLocaleString()} VND</p>
      <p><b>Ghi chú:</b> ${order.note || "Không có"}</p>
    `;

    res.send(`
      <h2>Chi tiết đơn hàng</h2>
      <p><b>Họ tên:</b> ${order.name}</p>
      <p><b>Điện thoại:</b> ${order.phone}</p>
      <p><b>Email:</b> ${order.email}</p>
      <p><b>Địa chỉ:</b> ${order.address}</p>
      <h3>Giỏ hàng</h3>
      ${cartHtml}
    `);
  } catch(err) {
    console.error(err);
    res.status(500).send("Lỗi server");
  }
});
// ===== Run server =====

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});