const { validationResult } = require('express-validator')
const User = require('../models/user')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

exports.signup = (req, res, next) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, try again!')
        error.statusCode = 422
        throw error
    }

    const email = req.body.email
    const name = req.body.name
    const password = req.body.password

    bcrypt.hash(password, 12).then(hashedPassword => {
        const user = new User({
            name: name,
            email: email,
            password: hashedPassword
        })

        user.save().then(user => {
            res.status(201).json({
                message: 'User added successfully!',
                userId: user._id
            })
        })
    })
}

exports.login = (req, res, next) => {
    const email = req.body.email
    const password = req.body.password
    let loadedUser

    User.findOne({ email: email }).then(user => {
        
        if (!user) {
            const error = new Error('Could not find user')
            error.statusCode = 401
            throw error
        }

        loadedUser = user

        bcrypt.compare(password, loadedUser.password).then(isEqual => {
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

            return res.status(200).json({
                token: token,
                userId: loadedUser._id.toString()
            })
        })
    })
}