require('dotenv').config();
// ===== Modules =====
const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const multer = require("multer")
const cloudinary = require("cloudinary").v2
const nodemailer = require("nodemailer")

// ===== Cloudinary config =====
cloudinary.config({
  cloud_name: "dnrillagh",
  api_key: "984556969348289",
  api_secret: "bSt9Rx9JP80MvUTNpTyBhtZGotg"
})

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
  name: String,
  phone: String,
  email: String,
  address: String,
  note: String,
  total: Number,
  cart: Array,
  createdAt: { type: Date, default: Date.now }
})
const Order = mongoose.model("Order", orderSchema)





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

app.post("/api/order", async (req, res) => {
  try {
    const { name, phone, email, address, note, total, cart } = req.body;

    // Lưu order
    const order = new Order({ name, phone, email, address, note, total, cart });
    await order.save();

    // Tạo HTML giỏ hàng
    const cartHtml = `
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
          ${cart.map(p => `
            <tr>
              <td><img src="${p.image || 'https://via.placeholder.com/60'}" width="60"></td>
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

    // ===== Mailer =====
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    // Gửi mail
    const info = await transporter.sendMail({
      from: `"Fruit Shop" <${process.env.GMAIL_USER}>`,
      to: "lanvihuynh79@gmail.com",
      subject: `Đơn hàng mới từ ${name}`,
      html: `<h3>Thông tin khách hàng</h3>
             <p><b>Họ tên:</b> ${name}</p>
             <p><b>Điện thoại:</b> ${phone}</p>
             <p><b>Email:</b> ${email}</p>
             <p><b>Địa chỉ:</b> ${address}</p>
             <h3>Giỏ hàng</h3>
             ${cartHtml}`
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

// ===== Run server =====
const PORT = 3000
app.listen(PORT,()=>console.log("Server running on http://localhost:"+PORT))