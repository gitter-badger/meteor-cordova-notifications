Cordova = {};

if (Meteor.isCordova) {

    NotificationClient = function(options) {

        if (!options || !options.gcmAuthorization || !options.senderId) {
            throw new Meteor.Error('required_options', 'gcmAuthorization and senderId must be supplied as options as a minimum');
        }

        var instance = {};

        var successHandler = options.successHandler || function(data) {
            console.log("Success: " + JSON.stringify(data));
        };

        var errorHandler = options.errorHandler || function(e) {
            console.log("Error " + e);
        };

        var tokenHandler = options.tokenHandler || function(data) {
            // TODO: CALL UPDATE APN TOKEN METHOD HERE (NOT SURE OF THE FORMAT IT ARRIVES IN)
            // https://developer.apple.com/library/ios/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/Chapters/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW12
        }

        var messageHandlerGCM = options.messageHandlerGCM || function(payload, foreground, coldstart) {
            if (!payload) return null;
            if (foreground && !coldstart) {
                navigator.notification.alert(
                    payload.message,
                    options.alertCallback,
                    payload.title
                );
            } else {
                window.plugin.notification.local.add(
                    _.extend(options.notificationOptions, {
                        message: payload.message,
                        title: payload.title,
                        autoCancel: true
                    })
                );
            }
        };

        var messageHandlerAPN = function(event) {
            // TODO: TAKE WHATEVER ACTION ON RECEIPT OF AN APN MESSAGE
            // http://plugins.cordova.io/#/package/com.phonegap.plugins.pushplugin
            // http://plugins.cordova.io/#/package/de.appplant.cordova.plugin.local-notification
            // http://plugins.cordova.io/#/package/org.apache.cordova.dialogs 
        }

        Cordova.onNotificationGCM = options.onNotificationGCM || function(res) {
            if (res.event === 'registered') {
                if (res.regid) {
                    Meteor.call('cordova-notifications/updateRegid', res.regid, options.registeredCallback);
                }
            } else if (res.event === 'message') {
                messageHandlerGCM(res.payload, res.foreground, res.coldstart);
            }
        }

        Cordova.onNotificationAPN = options.onNotificationAPN || function(event) {
            // TODO: PROBABLY JUST PASS THE EVENT STRAIGHT THROUGH TO messageHandlerAPN SINCE THERE'S NO
            // TOKEN REGISTRATION TO WORRY ABOUT HERE FOR APN, JUST NOTIFICATIONS.
        }

        Tracker.autorun(function(c) {

            if (Meteor.user()) {
                if (device.platform.toLowerCase() === 'android') {
                    window.plugins.pushNotification.register(successHandler, errorHandler, {
                        "senderID": options.senderId.toString(),
                        "ecb": "Cordova.onNotificationGCM"
                    });
                } else {
                    // TODO: CALL APN REGISTRATION HERE, PASSING Cordova.onNotificationAPN, etc.
                    // http://plugins.cordova.io/#/package/com.phonegap.plugins.pushplugin
                  }
                c.stop();
            }
        });

        return instance

    }

} else if (Meteor.isServer) {

    NotificationClient = function(options) {

        if (!options || !options.gcmAuthorization || !options.senderId) {
            return false;
        }

        var Future = Npm.require('fibers/future'),
            instance = {};

        instance.sendNotification = function(users, data) {

            if (typeof users === 'string')
                users = Meteor.users.find(users).fetch();
            else if (typeof users === "object" && users._id)
                users = [users];
            else if (users instanceof Mongo.Cursor)
                users = users.fetch()
            else if (!users instanceof Array)
                throw new Meteor.Error('bad_users_argument', 'Supplied user(s) data is not one of: user id, user object, cursor, array of user objects.');

            var regids = _.without(
                    _.pluck(users, 'regid'),
                    undefined),
                payload = {
                    registration_ids: regids,
                    data: data
                },
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'key=' + options.gcmAuthorization
                },
                url = "https://android.googleapis.com/gcm/send",
                fut = new Future();

            if (regids.length) {
                HTTP.post(url, {
                        headers: headers,
                        data: payload
                    },
                    function(err, res) {
                        if (err) {
                            fut.throw(err);
                        } else {
                            fut.return({
                                response: res,
                                userCount: regids.length
                            });
                        }
                    }
                );
            }

            // TODO: PULL OUT A LIST OF APN TOKENS FROM users ARRAY AND NOTIFY THEM
            // THIS NPM PACKAGE MIGHT SIMPLIFY THINGS: https://www.npmjs.org/package/apn

            // IN ADDITION, AT PRESENT THIS IS USING A FUTURE TO RETURN THE GCM RESPONSE AND GCM USERS NOTIFIED,
            // SO APN DISTRIBUTION WOULD PROBABLY HAVE TO BE PUT IN THE HTTP CALLBACK OR ELSE USE AN ASYNC LIBRARY
            // FUNCTION TO CALL fut.return WHEN BOTH RESPONSES HAVE BEEN RECEIVED

            return fut.wait();

        };

        Meteor.methods({
            'cordova-notifications/updateRegid': function(regid) {
                Meteor.users.update(this.userId, {
                    $set: {
                        regid: regid
                    }
                });
            },
            // TODO: ADD METHOD TO ATTACH APN TOKEN TO USER DOC
        });

        return instance;

    }

} else {

    NotificationClient = function() {};

}