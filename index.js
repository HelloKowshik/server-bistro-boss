const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const PORT = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zg5lt79.mongodb.net/?appName=Cluster0`;


app.use(cors({
    origin: ['http://localhost:5173', 'https://bistro-boss-d5479.web.app', 'https://bistro-boss-d5479.firebaseapp.com'],
    credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => res.send('Bistro Running!'));


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const userCollection = client.db('distroDB').collection('users');
    const menuCollection = client.db('distroDB').collection('menu');
    const reviewCollection = client.db('distroDB').collection('reviews');
    const cartCollection = client.db('distroDB').collection('carts');
    const paymentCollection = client.db('distroDB').collection('payments');


    app.post('/jwt', async(req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCES_TOKEN_SECRET, {expiresIn: '1h'});
        res.send({token});
    });

    const verifyToken = (req, res, next) => {
        // console.log(req.headers.authorization);
        if(!req.headers.authorization){
          return res.status(401).send({message: 'unauthorized access'});
        }
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCES_TOKEN_SECRET, (err, decoded) => {
          if(err){
            return res.status(401).send({message: 'unauthorized access'});
          }
          req.decoded = decoded;
          next();
        });
    };

    const verifyAdmin = async(req, res, next) => {
        const email = req.decoded.email;
        const query = {email: email};
        const user = await userCollection.findOne(query);
        const isAdmin = user?.role === 'admin';
        if(!isAdmin){
          return res.status(403).send({message: 'forbidden access'});
        }
        next();
    };

    app.get('/users/admin/:email', verifyToken, async(req, res) => {
        const email = req.params.email;
        if(email !== req.decoded.email){
          return res.status(403).send({message: 'forbidden access'});
        }
        const query = {email: email};
        const user = await userCollection.findOne(query);
        let admin = false;
        if(user){
          admin = user?.role === 'admin';
        }
        res.send({admin});
    });

    app.get('/users', verifyToken, verifyAdmin, async(req, res) => {
        const users = await userCollection.find().toArray();
        res.send(users);
    });

    app.post('/users', async(req, res) => {
        const user = req.body;
        const query = {email: user.email};
        const existingUser = await userCollection.findOne(query);
        if(existingUser){
          return res.send({message: 'User already Exists', insertedId: null});
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) => {
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)};
        const updatedDoc = {
          $set:{
            role: 'admin'
          }
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await userCollection.deleteOne(query);
        res.send(result);
    });

    app.get('/menu', async(req, res) => {
        const result = await menuCollection.find().toArray();
        res.send(result);
    });

    app.get('/menu/:id', async(req, res) => {
        const id = req.params.id;
        const q = {_id: new ObjectId(id)}
        const result = await menuCollection.findOne(q);
        res.send(result);
    });

    app.post('/menu', verifyToken, verifyAdmin, async(req, res) => {
        const data = req.body;
        const result = await menuCollection.insertOne(data);
        res.send(result);
    });

    app.patch('/menu/:id', async(req, res) => {
        const id = req.params.id;
        const item = req.body;
        const filter = {_id: new ObjectId(id)};
        const updatedDoc = {
          $set:{
            name: item.name,
            price: item.price,
            category: item.category,
            recipe: item.recipe,
            image: item.image
          }
        };
        const result = await menuCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await menuCollection.deleteOne(query);
        res.send(result);
    });

    app.get('/reviews', async(req, res) => {
        const result = await reviewCollection.find().toArray();
        res.send(result);
    });

    app.get('/carts', async(req, res) => {
      const email = req.query.email;
      const result = await cartCollection.find({email: email}).toArray();
      res.send(result);
    });

    app.post('/carts', async(req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete('/carts/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/payments/:email',verifyToken, async(req, res) => {
      const email = req.params.email;
      const query = {email: email};
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'});
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/create-payment-intent', async(req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ["card"],
      });
      res.send({clientSecret: paymentIntent.client_secret});
    });

    app.post('/payments', async(req, res) => {
      const paymentInfo = req.body;
      const paymentResult = await paymentCollection.insertOne(paymentInfo);
      const query = {_id:{
        $in:paymentInfo.cartIds.map(id => new ObjectId(id))
      }};
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({paymentResult, deleteResult});
    });

    app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const result = await paymentCollection.aggregate([
      {
        $group:{
          _id: null,
          totalRevenue:{
            $sum: '$price'
          }
        }
      }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({users, menuItems, orders, revenue});
    });

    app.get('/order-stats', verifyToken, verifyAdmin, async(req, res) => {
      const result = await paymentCollection.aggregate([
      {
        $unwind: '$menuItemIds'
      },
      {
        $addFields:{
          menuId: {$toObjectId:'$menuItemIds'}
        }
      },
      {
        $lookup:{
          from: 'menu',
          localField: 'menuId',
          foreignField: '_id',
          as: 'menuItems'
        }
      },
      {
        $unwind: '$menuItems'
      },
      {
        $group:{
          _id: '$menuItems.category',
          quantity: {$sum: 1},
          revenue: {$sum: '$menuItems.price'}
        }
      },
      {
        $project:{
          _id: 0,
          category: '$_id',
          quantity: '$quantity',
          revenue: '$revenue'
        }
      }
      ]).toArray();
      res.send(result);
    });

  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);



app.listen(PORT, ()=>console.log(`Server Active at PORT:${PORT}`));
