const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000;

const corsApi = {
    origin: ['http://localhost:5173'],
    credentials: true
}

app.use(cors(corsApi))
app.use(express.json())
app.use(cookieParser())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.eedxn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// verify token 
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access..' })
        }
        // console.log(decoded);

        req.user = decoded;
    })
    next()
}


async function run() {
    try {

        const db = client.db('nextGen')
        const blogsCollections = db.collection('blogs')
        const wishlistCollections = db.collection('wishlists')
        const commentsCollections = db.collection('comments')


        // JWT create
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            // console.log(user.userEmail);
            const token = jwt.sign(user, process.env.SECRET_KEY, { expiresIn: '1d' })
            // console.log(token);
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        // jwt token clear 
        app.get('/signOut', async (req, res) => {
            res
                .clearCookie('token', {
                    maxAge: 0,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })



        // add blog in blogsCollections 
        app.post('/add-blog', async (req, res) => {
            const newBlog = req.body;
            const result = await blogsCollections.insertOne(newBlog);
            // console.log(result);
            res.send(result)
        })

        // 6 blogs data load 
        app.get('/blogs', async (req, res) => {
            const result = await blogsCollections.find().limit(6).toArray();
            res.send(result)
        })

        // all blogs data load 
        app.get('/all-blogs', async (req, res) => {
            const filter = req.query.category;
            console.log(filter);
            const search = req?.query?.search;
            // const query = {
            //     $title: {
            //         $search: search,
            //     }
            // }

            let query = {
                title: {
                    $regex: search,
                    $options: 'i'
                }
            }
            if (filter) query.category = filter;
            const result = await blogsCollections.find(query).toArray();
            res.send(result)
        })

        // add wishlist in wishlistCollections 
        app.post('/add-wishlist', async (req, res) => {
            const newWishlist = req.body;
            const alreadyExist = await wishlistCollections.findOne({ email: newWishlist.email, id: newWishlist.id })
            if (alreadyExist) {
                return res.status(400).send('You have already add on this wishlist...!')
            }
            const result = await wishlistCollections.insertOne(newWishlist);
            res.send(result)
        })

        // get specific user wishlist in wishlistCollections 
        app.get('/wishlists/:email', verifyToken, async (req, res) => {
            const decodedEmail = req.user?.userEmail
            const email = req.params.email;
            // console.log(decodedEmail);
            if (decodedEmail !== email) {
                return res.status(401).send({ message: 'unauthorized access.. you are a not valid user.!' })
            }
            const filter = { email: email }
            const result = await wishlistCollections.find(filter).toArray();
            res.send(result)
        })

        // delete wishlist in wishlistCollections
        app.delete('/delete-wishlist/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await wishlistCollections.deleteOne(query)
            res.send(result)
        })

        // get the one blog in blogsCollections 
        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await blogsCollections.findOne(query)
            res.send(result)
            // console.log(id);
        })

        // update the blog in blogsCollections 
        app.patch('/update-blog/:id', async (req, res) => {
            const id = req.params.id;
            const updatedBlog = req.body;
            const updatedDoc = {
                $set: updatedBlog
            }
            const filter = { _id: new ObjectId(id) }
            const result = await blogsCollections.updateOne(filter, updatedDoc)
            res.send(result)

        })


        // add comments to the commentsCollections DB
        app.post('/add-comment', async (req, res) => {
            const newComment = req.body;
            const result = await commentsCollections.insertOne(newComment);
            res.send(result)
            console.log(result);
        })

        // get all the comments to the commentsCollections DB
        app.get('/comments/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { blog_id: id }
            const result = await commentsCollections.find(filter).toArray()
            res.send(result)
            console.log(result);
        })


        app.get("/top-posts", async (req, res) => {
            try {
                const result = await blogsCollections
                    .aggregate([
                        {
                            $addFields: {
                                wordCount: { $size: { $split: ["$longDescription", " "] } },
                            },
                        },
                        { $sort: { wordCount: -1 } },
                        { $limit: 10 },
                        {
                            $project: {
                                title: 1,
                                author: 1,
                                wordCount: 1,
                                date: 1,
                                category: 1,
                            },
                        },
                    ])
                    .toArray();

                res.send(result);



            } catch (error) {
                console.error("Error fetching top posts:", error);
                res.status(500).send({ error: "An error occurred while fetching top posts" });
            }

            // const options = { longDescription: -1 }
            // const result = await blogsCollections.find().sort({ longDescription: -1 }).toArray()
            // res.send(result)
        });



        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('next gen server is running...')
})

app.listen(port, () => {
    console.log(`next gen server listing on port ${port}`);

})

