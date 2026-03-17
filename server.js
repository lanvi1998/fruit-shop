const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const multer = require("multer")
const path = require("path")

const app = express()

app.use(express.json())
app.use(cors())
app.use(express.static("public"))
app.use("/uploads", express.static("uploads"))

// ===== MongoDB =====
mongoose.connect("mongodb://lanvi:lanvi98@ac-yeq62ge-shard-00-00.lxr0whp.mongodb.net:27017,ac-yeq62ge-shard-00-01.lxr0whp.mongodb.net:27017,ac-yeq62ge-shard-00-02.lxr0whp.mongodb.net:27017/fruitshop?ssl=true&replicaSet=atlas-8oee57-shard-0&authSource=admin&retryWrites=true&w=majority")
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))

// ===== Schema =====
const fruitSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    description: String
  })

const Fruit = mongoose.model("Fruit", fruitSchema)

// ===== Upload config =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({ storage })

// ===== API =====

// GET danh sách
app.get("/api/fruits", async (req, res) => {
  try {
    const fruits = await Fruit.find()
    res.json(fruits)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE
app.delete("/api/fruits/:id", async (req, res) => {
  try {
    await Fruit.findByIdAndDelete(req.params.id)
    res.json({ message: "Deleted" })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
// UPLOAD ảnh + thêm fruit
app.post("/api/upload", upload.single("image"), async (req, res) => {
    try {
      console.log("FILE:", req.file)
      console.log("BODY:", req.body)
  
      const { name, price, description } = req.body
  
      if (!req.file) {
        return res.status(400).json({ error: "Chưa chọn ảnh" })
      }
  
      const fruit = new Fruit({
        name,
        price,
        description,
        image: "/uploads/" + req.file.filename
      })
  
      await fruit.save()
  
      res.json(fruit)
    } catch (err) {
      console.log("🔥 LỖI THẬT:", err)
      res.status(500).json({ error: err.message })
    }
  })

// UPLOAD ảnh + thêm fruit
app.use("/uploads", express.static("uploads"))
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const { name, price, description } = req.body

    if (!req.file) {
      return res.status(400).json({ error: "Chưa chọn ảnh" })
    }

    const fruit = new Fruit({
      name,
      price,
      description,
      image: "/uploads/" + req.file.filename
    })

    await fruit.save()

    res.json(fruit)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== RUN SERVER =====
app.listen(3000, () => {
  console.log("Server running on port 3000")
})
