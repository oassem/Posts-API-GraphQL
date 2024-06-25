const { validationResult } = require('express-validator')
const Post = require('../models/post')
const User = require('../models/user')
const path = require('path')
const fs = require('fs')

exports.getPosts = async (req, res, next) => {
    const currentPage = req.query.page || 1
    const perPage = 2
    const itemsCount = await Post.find().countDocuments()
    const posts = await Post.find()
        .sort({ createdAt: -1 })
        .populate('creator')
        .skip((currentPage - 1) * perPage)
        .limit(perPage)

    res.status(200).json({
        posts: posts,
        totalItems: itemsCount
    })
}

exports.getPost = (req, res, next) => {
    const postId = req.params.postId

    Post.findById(postId).then(post => {
        if (!post) {
            const error = new Error('Could not find post')
            error.statusCode = 404
            throw error
        }

        res.status(200).json({
            post: post
        })

    }).catch(err => {
        next(err)
    })
}

exports.createPost = (req, res, next) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, try again!')
        error.statusCode = 422
        throw error
    }

    if (!req.file) {
        const error = new Error('No image provided')
        error.statusCode = 422
        throw error
    }

    const imageUrl = req.file.path.replace(/\\/g, '/')
    const title = req.body.title
    const content = req.body.content
    const userId = req.userId
    const post = new Post({
        title: title,
        content: content,
        imageUrl: imageUrl,
        creator: userId
    })

    post.save().then(async (post) => {
        const user = await User.findById(userId)
        user.posts.push(post)
        user.save()

        res.status(201).json({
            message: 'Post created successfully!',
            post: post,
            creator: { _id: user._id, name: user.name }
        })

    }).catch(err => {
        next(err)
    })
}

exports.editPost = (req, res, next) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, try again!')
        error.statusCode = 422
        throw error
    }

    const postId = req.params.postId
    const title = req.body.title
    const content = req.body.content
    let imageUrl = req.body.image

    if (req.file) {
        imageUrl = req.file.path.replace(/\\/g, '/')
    }

    Post.findById(postId).populate('creator').then(post => {
        if (!post) {
            const error = new Error('Could not find post')
            error.statusCode = 404
            throw error
        }

        if (post.creator._id.toString() !== req.userId) {
            const error = new Error('You do not have permission')
            error.statusCode = 403
            throw error
        }

        if (imageUrl !== post.imageUrl) {
            clearImage(post.imageUrl)
        }

        post.title = title
        post.content = content
        post.imageUrl = imageUrl

        post.save().then(post => {
            res.status(200).json({
                message: 'Post updated successfully!',
                post: post
            })
        })

    }).catch(err => {
        next(err)
    })
}

exports.deletePost = (req, res, next) => {
    const postId = req.params.postId

    Post.findById(postId).then(post => {
        if (!post) {
            const error = new Error('Could not find post')
            error.statusCode = 404
            throw error
        }

        if (post.creator.toString() !== req.userId) {
            const error = new Error('You do not have permission')
            error.statusCode = 403
            throw error
        }

        clearImage(post.imageUrl)

        post.deleteOne().then(async (post) => {
            const user = await User.findById(req.userId)
            user.posts.pull(postId)
            user.save()

            res.status(200).json({
                message: 'Post deleted successfully!',
                post: post
            })
        })

    }).catch(err => {
        next(err)
    })
}

const clearImage = filePath => {
    filePath = path.join(__dirname, '..', filePath)
    fs.unlink(filePath, (err) => { console.error(err) })
}