import express from 'express';
import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI in server/.env. See docs/STEP_10_SETUP.md.');
  process.exit(1);
}
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'2kb'}));
const Record=mongoose.model('DemoRecord',new mongoose.Schema({
  title:{type:String,required:true,trim:true,maxlength:120}
},{timestamps:true}));
app.get('/api/health',(_req,res)=>res.status(mongoose.connection.readyState===1?200:503).json({database:mongoose.connection.readyState===1?'connected':'unavailable'}));
app.get('/api/demo-records',async(_req,res,next)=>{
  try {res.json(await Record.find().sort({createdAt:-1,_id:-1}).limit(100).lean());}
  catch(error){next(error);}
});
app.post('/api/demo-records',async(req,res,next)=>{
  const title=req.body?.title;
  if(typeof title!=='string'||!title.trim()||title.trim().length>120)
    return res.status(400).json({error:'Enter a test note between 1 and 120 characters.'});
  try {res.status(201).json(await Record.create({title:title.trim()}));}
  catch(error){next(error);}
});
app.use((error,_req,res,_next)=>{
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON.'});
  if(error.type==='entity.too.large')return res.status(413).json({error:'Request is too large.'});
  res.status(503).json({error:'Database request failed. Check the connection and retry.'});
});
try {
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
  const server=app.listen(Number(process.env.PORT)||3001,'127.0.0.1',()=>console.log('MediMate API: http://127.0.0.1:'+(process.env.PORT||3001)));
  async function stop(){server.close(async()=>{await mongoose.disconnect();process.exit(0);});}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
} catch {
  console.error('MongoDB connection failed. Check server/.env and ensure MongoDB is running.');
  process.exit(1);
}
