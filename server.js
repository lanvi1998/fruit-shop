const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

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
  name:String,
  price:Number,
  image:String,
  description:String,
  category:String
})
const Fruit = mongoose.model("Fruit", fruitSchema)

const userSchema = new mongoose.Schema({
  username:{type:String, unique:true},
  password:String,
  role:{type:String, default:"user"} // "admin" hoặc "user"
})
const User = mongoose.model("User", userSchema)

// ===== Tạo folder uploads nếu chưa có =====
if(!fs.existsSync("uploads")) fs.mkdirSync("uploads")

// ===== Multer config =====
const storage = multer.diskStorage({
  destination:(req,file,cb)=> cb(null,"uploads/"),
  filename:(req,file,cb)=> cb(null,Date.now()+path.extname(file.originalname))
})
const upload = multer({storage})

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
    const imagePath = path.join(__dirname, fruit.image)
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
    const { name, price, category, description, username } = req.body
    const user = await User.findOne({ username })
    if(!user || user.role!=="admin") return res.status(403).json({error:"Chỉ admin mới được phép"})
    if(!req.file) return res.status(400).json({error:"Chưa chọn ảnh"})

    const fruit = new Fruit({
      name,
      price,
      category: category.toLowerCase(),
      description,
      image:"/uploads/"+req.file.filename
    })
    await fruit.save()
    res.json(fruit)
  }catch(err){
    console.log(err)
    res.status(500).json({error:err.message})
  }
})

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

// ===== Run server =====
const PORT = 3000
app.listen(PORT,()=>console.log("Server running on http://localhost:"+PORT))