const express = require('express')
const app = express()

const mongoose = require('mongoose')
const multer = require('multer')
const { graphqlHTTP } = require('express-graphql')
const graphqlSchema = require('./graphql/schema')
const graphqlResolvers = require('./graphql/resolvers')
const auth = require('./middleware/auth')
const bodyParser = require('body-parser')
const path = require('path')
const fs = require('fs')

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images')
    },

    filename: (req, file, cb) => {
        cb(null, new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname)
    }
})

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg') {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

app.use(bodyParser.json())
app.use(multer({ storage: fileStorage, fileFilter: fileFilter }).single('image'))
app.use('/images', express.static(path.join(__dirname, 'images')))
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200)
    }

    next()
})

app.use(auth)

app.put('/post-image', (req, res, next) => {
    if (!req.isAuth) {
        const error = new Error('Not authenticated!')
        error.code = 401
        throw error
    }

    if (!req.file) {
        return res.status(200).json({ message: 'No file provided!' })
    }

    if (req.body.oldPath) {
        filePath = path.join(__dirname, req.body.oldPath)
        fs.unlink(filePath, (err) => { console.error(err) })
    }

    return res.status(201).json({ message: 'File stored.', filePath: req.file.path })
})

app.use('/graphql', graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolvers,
    graphiql: true,

    customFormatErrorFn(err) {
        if (!err.originalError) {
            return err
        }

        const data = err.originalError.data
        const message = err.message || "An error occured!"
        const code = err.originalError.code

        return {
            message: message,
            code: code,
            data: data
        }
    }
}))

app.use((error, req, res, next) => {
    const status = error.statusCode || 500
    const message = error.message
    res.status(status).json({
        message: message
    })
})

mongoose.connect('mongodb+srv://omarelghazalynweave:HM5ip9T6LomkmVpX@cluster0.hbxmz04.mongodb.net/messages?retryWrites=true&w=majority&appName=Cluster0').then(() => {
    app.listen(8080)
})