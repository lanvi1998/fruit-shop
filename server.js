const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const nodemailer = require("nodemailer") // Thêm nodemailer

const app = express()
app.use(express.json())
app.use(cors())
app.use(express.static("public"))

app.use("/uploads", express.static(path.join(__dirname, "uploads")))

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
  total: Number,
  cart: Array,
  createdAt: { type: Date, default: Date.now }
})
const Order = mongoose.model("Order", orderSchema)


// ===== Tạo folder uploads nếu chưa có =====
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// ===== Multer config =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
// ===== GET tất cả sản phẩm =====
app.get("/api/fruits", async (req,res)=>{
  try{
    const fruits = await Fruit.find().sort({_id:-1})
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
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin mới được phép"})

    const fruit = await Fruit.findById(req.params.id)
    if(!fruit) return res.status(404).json({error:"Not found"})
      const imagePath = path.join(__dirname, "uploads", path.basename(fruit.image));
    if(fs.existsSync(imagePath)) fs.unlinkSync(imagePath)
    await Fruit.findByIdAndDelete(req.params.id)
    res.json({message:"Deleted"})
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

// ===== Upload sản phẩm (admin only) =====
app.post("/api/upload", upload.single("image"), async (req,res)=>{
  try{
    const { name, price, category, description, username, unit } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin mới được phép"});
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"});

    // Lấy URL đầy đủ
    const protocol = req.protocol; // http hoặc https
    const host = req.get('host');  // localhost:3000 hoặc domain

    const fruit = new Fruit({
      name,
      price,
      unit,
      category: category.toLowerCase(),
      description,
      image: `${protocol}://${host}/uploads/${req.file.filename}` // ✅ URL đầy đủ
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
  try{
    const { username } = req.body
    const user = await User.findOne({ username })
    if(!user || user.role !== "admin") return res.status(403).json({error:"Chỉ admin mới được phép"})
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"})

      const protocol = req.protocol
      const host = req.get("host")
      
      const banner = new Banner({
        image: `${protocol}://${host}/uploads/${req.file.filename}`
      })
    await banner.save()
    res.json({success:true, banner})
  }catch(err){
    console.log(err)
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
    const imagePath = path.join(__dirname, banner.image)
    if(fs.existsSync(imagePath)) fs.unlinkSync(imagePath)
    await Banner.findByIdAndDelete(id)
    res.json({success:true})
  }catch(err){
    res.status(500).json({error:err.message})
  }
})

app.post("/api/order", async (req, res) => {
  try {
    const { name, phone, email, address, total, cart } = req.body;

    // Lưu đơn hàng vào MongoDB
    const order = new Order({ name, phone, email, address, total, cart });
    await order.save();

   // Tạo HTML giỏ hàng chi tiết (fix lỗi)
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
    ${cart.map(p => {
      const imageUrl = p.image ? `https://coutsaigon.onrender.com${p.image}` : "https://via.placeholder.com/60";
      return `
        <tr>
        <td><img src="${imageUrl}" width="60"></td>
          <td>${p.name || ''}</td>
          
          <td>${p.unit || ''}</td>
          <td>${p.qty || 0}</td>
          <td>${((p.price || 0) * (p.qty || 0)).toLocaleString()}</td>
        </tr>
      `;
    }).join('')}
  </tbody>
</table>
<p><b>Tổng tiền:</b> ${(total || 0).toLocaleString()} VND</p>
`;
    // Cấu hình transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "coutsaigon1234@gmail.com",
        pass: "mlzlepucmitgylpt" // App Password
      },
      tls: { rejectUnauthorized: false }
    });

    // Cấu hình mail
    const mailOptions = {
      from: '"Fruit Shop" <coutsaigon1234@gmail.com>',
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
      `
    };

    // Gửi mail
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Lỗi gửi mail:", err); // sẽ in chi tiết lý do fail
        return res.status(500).json({ success: false, message: "Gửi đơn hàng thất bại" });
      } else {
        console.log("Mail đã gửi:", info); // in info đầy đủ
        return res.json({ success: true, message: "Đơn hàng đã gửi và lưu thành công" });
      }
    });

  } catch (err) {
    console.error(err);
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
    const q = req.query.q || "";
    if (!q) return res.json([]);

    const qNormalized = removeVietnameseTones(q);

    const products = await Fruit.find();

    const filtered = products.filter(p => {
      const name = removeVietnameseTones(p.name);
      return name.includes(qNormalized);
    });

    res.json(filtered);

  } catch (err) {
    console.error(err);
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
app.post("/api/fruits/:id/thumb", upload.single("thumb"), async (req,res)=>{
  try{
    const { username } = req.body;
    const user = await User.findOne({ username });
    if(!user || user.role !== "admin") 
      return res.status(403).json({success:false,message:"Chỉ admin"});

    const fruit = await Fruit.findById(req.params.id);
    if(!fruit) return res.status(404).json({success:false,message:"Không tìm thấy sản phẩm"});

    if(!req.file) return res.status(400).json({success:false,message:"Chưa chọn file"});

    if(!fruit.thumbs) fruit.thumbs=[];
    const protocol = req.protocol;
const host = req.get("host");
const thumbPath = `${protocol}://${host}/uploads/${req.file.filename}`;
fruit.thumbs.push(thumbPath);
    await fruit.save();

    // Trả về product đã update để front-end hiển thị ngay
    res.json({success:true, product: fruit});
  }catch(err){ 
    console.error(err); 
    res.status(500).json({success:false,message:err.message}); 
  }
}); 


// ===== Run server =====
const PORT = 3000
app.listen(PORT,()=>console.log("Server running on http://localhost:"+PORT))
// ===== DELETE THUMB =====
app.delete("/api/fruits/:id/thumb", async (req,res)=>{

  try{
  
  const {username,image} = req.body
  
  if(username!=="admin"){
  return res.status(403).json({message:"Chỉ admin mới được xoá"})
  }
  
  const fruit = await Fruit.findById(req.params.id)
  
  if(!fruit) return res.status(404).json({message:"Không tìm thấy sản phẩm"})
  
  // xoá khỏi database
  fruit.thumbs = fruit.thumbs.filter(t=>t!==image)
  
  await fruit.save()
  
  // xoá file vật lý
  const filePath = path.join(__dirname, "uploads", path.basename(image));
  
  if(fs.existsSync(filePath)){
  fs.unlinkSync(filePath)
  }
  
  res.json({success:true})
  
  }catch(err){
  
  console.error(err)
  res.status(500).json({message:"Lỗi xoá ảnh"})
  
  }
  
  })