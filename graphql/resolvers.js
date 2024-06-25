const User = require('../models/user')
const Post = require('../models/post')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const path = require('path')
const fs = require('fs')
const validator = require('validator')

module.exports = {
    createUser: async function (args, req) {
        const errors = []

        if (!validator.isEmail(args.userInput.email)) {
            errors.push({ message: 'Email is invalid' })
        }

        if (validator.isEmpty(args.userInput.password) || !validator.isLength(args.userInput.password, { min: 5 })) {
            errors.push({ message: 'Password too short' })
        }

        if (errors.length > 0) {
            const error = new Error('Invalid input!')
            error.data = errors
            error.code = 422
            throw error
        }

        const exisitingUser = await User.findOne({ email: args.userInput.email })

        if (exisitingUser) {
            const error = new Error('User already exists!')
            throw error
        }

        return bcrypt.hash(args.userInput.password, 12).then(hashedPassword => {
            const user = new User({
                name: args.userInput.name,
                email: args.userInput.email,
                password: hashedPassword
            })

            return user.save().then(user => {
                return { ...user._doc, id: user._id.toString() }
            })
        })
    },

    login: async function (args, req) {
        const email = args.email
        const password = args.password
        let loadedUser

        return User.findOne({ email: email }).then(async (user) => {

            if (!user) {
                const error = new Error('Could not find user')
                error.statusCode = 401
                throw error
            }

            loadedUser = user

            return bcrypt.compare(password, loadedUser.password).then(isEqual => {
                if (!isEqual) {
                    const error = new Error('Password not valid')
                    error.statusCode = 401
                    throw error
                }

                const token = jwt.sign(
                    {
                        email: loadedUser.email,
                        userId: loadedUser._id.toString()
                    },
                    'somesupersecret',
                    { expiresIn: '1h' }
                )

                return {
                    token: token,
                    userId: loadedUser._id.toString()
                }
            })
        })
    },

    createPost: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const errors = []

        if (validator.isEmpty(args.postInput.title) || !validator.isLength(args.postInput.title, { min: 5 })) {
            errors.push({ message: 'Title is invalid' })
        }

        if (validator.isEmpty(args.postInput.content) || !validator.isLength(args.postInput.content, { min: 5 })) {
            errors.push({ message: 'Content is invalid' })
        }

        if (errors.length > 0) {
            const error = new Error('Invalid input!')
            error.data = errors
            error.code = 422
            throw error
        }

        const userId = req.userId
        const user = await User.findById(userId)

        const post = new Post({
            title: args.postInput.title,
            content: args.postInput.content,
            imageUrl: args.postInput.imageUrl,
            creator: user
        })

        return post.save().then(async (post) => {
            user.posts.push(post)
            user.save()

            return {
                ...post._doc,
                _id: post._id.toString(),
                createdAt: post.createdAt.toISOString(),
                updatedAt: post.updatedAt.toISOString()
            }
        }).catch(err => {
            next(err)
        })
    },

    posts: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const currentPage = args.page || 1
        const perPage = 2
        const totalPosts = await Post.find().countDocuments()
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .populate('creator')
            .skip((currentPage - 1) * perPage)
            .limit(perPage)

        return {
            posts: posts.map(post => {
                return {
                    ...post._doc,
                    _id: post._id.toString(),
                    createdAt: post.createdAt.toISOString(),
                    updatedAt: post.updatedAt.toISOString()
                }
            }),

            totalPosts: totalPosts
        }
    },

    post: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const post = await Post.findById(args.id).populate('creator')

        if (!post) {
            const error = new Error('No post found!')
            error.code = 404
            throw error
        }

        return {
            ...post._doc,
            _id: post._id.toString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        }
    },

    updatePost: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const post = await Post.findById(args.id).populate('creator')

        if (!post) {
            const error = new Error('No post found!')
            error.code = 404
            throw error
        }

        if (post.creator._id.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized!')
            error.code = 403
            throw error
        }

        const errors = []

        if (validator.isEmpty(args.postInput.title) || !validator.isLength(args.postInput.title, { min: 5 })) {
            errors.push({ message: 'Title is invalid' })
        }

        if (validator.isEmpty(args.postInput.content) || !validator.isLength(args.postInput.content, { min: 5 })) {
            errors.push({ message: 'Content is invalid' })
        }

        if (errors.length > 0) {
            const error = new Error('Invalid input!')
            error.data = errors
            error.code = 422
            throw error
        }

        post.title = args.postInput.title
        post.content = args.postInput.content
        if (args.postInput.imageUrl !== 'undefined') {
            post.imageUrl = args.postInput.imageUrl
        }

        return post.save().then(async (post) => {
            return {
                ...post._doc,
                _id: post._id.toString(),
                createdAt: post.createdAt.toISOString(),
                updatedAt: post.updatedAt.toISOString()
            }
        }).catch(err => {
            next(err)
        })
    },

    deletePost: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const post = await Post.findById(args.id)

        if (!post) {
            const error = new Error('No post found!')
            error.code = 404
            throw error
        }

        if (post.creator.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized!')
            error.code = 403
            throw error
        }

        clearImage(post.imageUrl)

        post.deleteOne().then(async (post) => {
            const user = await User.findById(req.userId)
            user.posts.pull(args.id)
            user.save()

            return true
        }).catch(err => {
            next(err)
        })
    },

    user: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const user = await User.findById(req.userId)

        return {
            ...user._doc,
            _id: user._id.toString()
        }
    },

    updateStatus: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!')
            error.code = 401
            throw error
        }

        const oldUser = await User.findById(req.userId)

        oldUser.status = args.status

        const updatedUser = await oldUser.save()

        return {
            ...updatedUser._doc,
            _id: updatedUser._id.toString()
        }
    }
}

const clearImage = filePath => {
    filePath = path.join(__dirname, '..', filePath)
    fs.unlink(filePath, (err) => { console.error(err) })
}