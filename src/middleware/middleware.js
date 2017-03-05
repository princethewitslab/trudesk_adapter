/*
      .                              .o8                     oooo
   .o8                             "888                     `888
 .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
   888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
   888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
   888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
   "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 ========================================================================
 Created:    02/10/2015
 Author:     Chris Brame

 **/

"use strict";

var _ = require('lodash');
var db = require('../database');
var mongoose = require('mongoose');
var winston = require('winston');

var app, middleware = {};

middleware.db = function(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        winston.warn('MongoDB ReadyState = ' + mongoose.connection.readyState);
        db.init(function(e, database) {
            if (e) {
                return res.status(503).send();
            }

            req.db = database;
        });
    }

    next();
};

middleware.redirectToDashboardIfLoggedIn = function(req, res, next) {
    if (req.user) {
        if (req.user.tOTPKey) {
            return middleware.ensurel2Auth(req, res, next);
        } else {
            return res.redirect('/dashboard');
        }
    } else {
        return next();
    }
};

middleware.redirectToLogin = function(req, res, next) {
    if (!req.user) {
        if (!_.isUndefined(req.session))
            req.session.redirectUrl = req.url;

        return res.redirect('/');
    } else {
        if (req.user.deleted) {
            req.logout();
            req.session.l2auth = null;
            req.session.destroy();
            return res.redirect('/');
        } else {
            if (!_.isUndefined(req.user.tOTPKey)) {
                if (req.session.l2auth !== 'totp') {
                    return res.redirect('/');
                }
            }

            return next();
        }
    }
};

middleware.checkUserHasL2Auth = function(req, res, next) {
    if (!req.user) {
        return res.redirect('/');
    } else {
        if (_.isUndefined(req.user.tOTPKey)) {
            return next()
        }

        next();
    }
};

middleware.ensurel2Auth = function(req, res, next) {
    if (req.session.l2auth == 'totp') {
        if (req.user)
            return res.redirect('/dashboard');
        else
            return next();
    }
    return res.redirect('/l2auth');
};

//Common
middleware.loadCommonData = function(req, res, next) {
    var viewdata = require('../helpers/viewdata');
    viewdata.getData(req, function(data) {
        req.viewdata = data;

        next();
    });
};

middleware.cache = function(seconds) {
    return function(req, res, next) {
        res.setHeader("Cache-Control", "public, max-age=" + seconds);

        next();
    }
};

//API
middleware.api = function(req, res, next) {
    var accessToken = req.headers.accesstoken;
    if (_.isUndefined(accessToken) || _.isNull(accessToken)) {
        var user = req.user;
        if (_.isUndefined(user) || _.isNull(user)) return res.status(401).json({error: 'Invalid Access Token'});

        next();
    } else {
        var userSchema = require('../models/user');
        userSchema.getUserByAccessToken(accessToken, function(err, user) {
            if (err) return res.status(401).json({'error': err.message});
            if (!user) return res.status(401).json({'error': 'Invalid Access Token'});

            delete user['password'];

            req.user = user;

            next();
        });
    }
};

module.exports = function(server) {
    app = server;

    return middleware;
};
