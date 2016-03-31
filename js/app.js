'use strict';

/* App Module */

var app = angular.module('lovefieldApp', [
    'ngRoute',
    'smart-table',
    'datePicker',
    'ngAudio',
    'ui-notification',
    'angular-web-notification',
    'appControllers',
    'appServices'
]);

app.config(['$routeProvider',
    function($routeProvider) {
        $routeProvider.
            when('/', {
                templateUrl: 'public/partials/home.html',
                controller: 'appCtrl'
            }).
            otherwise({
                redirectTo: '/'
            });
    }]);
/* Controllers */

var appControllers = angular.module('appControllers', []);

appControllers.controller('appCtrl', ['$scope', '$interval', '$timeout', '$window', 'webNotification', 'ngAudio', 'appSv', 'Notification',
    function($scope, $interval, $timeout, $window, webNotification, ngAudio, appSv, Notification) {

        var task = {
            name: '',
            description: '',
            deadline: '',
            done: 0,
        };

        $scope.init = function () {
            $scope.rowCollection = [];
            appSv.openConnection();
            appSv.buildSchema();
            appSv.fetchAll().then(function(rows) {
                $scope.$apply(function() {
                    $scope.rowCollection = rows;
                });
                checkNewTask();
            });
            $scope.task = angular.copy(task);
            $window.notify.requestPermission();
            $scope.sound = ngAudio.load("public/sound/notification.mp3");
        };

        $scope.create = function(data) {
            if (!data.name.length || !data.description.length) {
                return Notification.error('Plz input name & description !');
            }
            if (!data.deadline) {
                return Notification.error('Plz input valid deadline !');
            }
            appSv.addTask(data, function() {
                Notification('★ Create completed ★');
                appSv.fetchAll().then(function(rows) {
                    $scope.$apply(function() {
                        $scope.rowCollection = rows;
                        $scope.reset();
                    });
                    $timeout(checkNewTask, 1000);
                });
            });
        };

        $scope.reset = function(form) {
            if (form) {
                form.$setPristine();
                form.$setUntouched();
            }
            $scope.task = angular.copy(task);
        };

        $scope.remove = function(id) {
            appSv.deleteTask(id, function() {
                Notification('★ Task:' + id +' is removed ★');
                appSv.fetchAll().then(function(rows) {
                    $scope.$apply(function() {
                        $scope.rowCollection = rows;
                        $scope.reset();
                    });
                });
            });
        };

        $scope.resolve = function(id) {
            appSv.doneTask(id, function() {
                Notification('★ Task:' + id +' is resolved ★');
                appSv.fetchAll().then(function(rows) {
                    $scope.$apply(function() {
                        $scope.rowCollection = rows;
                        $scope.reset();
                    });
                });
            });
        };

        var showNotification = function(title, content) {
            webNotification.showNotification(title, {
                body: content,
                icon: '/public/img/notification-icon.png',
                autoClose: 4000 //auto close the notification after 2 seconds (you manually close it via hide function)
            }, function onShow(error, hide) {
                if (error) {
                    window.alert('Unable to show notification: ' + error.message);
                } else {
                    setTimeout(function hideNotification() {
                        hide();
                    }, 5000);
                }
            });
        };

        var now = new Date();
        var isChecking = false;
        var checkNewTask = function() {
            if (isChecking) {
                return;
            }
            isChecking = true;
            now = new Date();
            now = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
            appSv.fetchNewTask(now).then(function(rows) {
                rows.forEach(function(row) {
                    showNotification(row.name, row.description);
                });
                if (rows.length) {
                    $scope.sound.play();
                    appSv.updateNewTask(now).then(function(){
                        isChecking = false;
                        appSv.fetchAll().then(function(rows) {
                            $scope.$apply(function() {
                                $scope.rowCollection = rows;
                            });
                        });
                    });
                } else {
                    isChecking = false;
                }
            });
        };

        $interval(checkNewTask, 5000);

        var tick = function() {
            $scope.clock = Date.now();
        }
        tick();
        $interval(tick, 1000);

    }]);

/* Services */

var appServices = angular.module('appServices', []);

appServices.factory('appSv', function() {
    var factory = {};

    factory.schemaBuilder = null;

    factory.openConnection = function() {
        factory.schemaBuilder = lf.schema.create('lovefield', 1);
    };

    factory.buildSchema = function() {
        var schemaBuilder = factory.schemaBuilder;
        schemaBuilder.createTable('Item').
            addColumn('id', lf.Type.INTEGER).
            addColumn('name', lf.Type.STRING).
            addColumn('description', lf.Type.STRING).
            addColumn('deadline', lf.Type.DATE_TIME).
            addColumn('done', lf.Type.BOOLEAN).
            addColumn('notified', lf.Type.BOOLEAN).
            addPrimaryKey(['id'], true).
            addIndex('idxDeadline', ['deadline'], false, lf.Order.DESC);
    };

    factory.addTask = function(data, onSuccess) {
        var schemaBuilder = factory.schemaBuilder;
        var Database;
        var item;
        schemaBuilder.connect().then(function(db) {
            Database = db;
            item = db.getSchema().table('Item');
            var row = item.createRow({
                'name': data.name,
                'description': data.description,
                'deadline': new Date(data.deadline),
                'done': (parseInt(data.done) === 0) ? false : true,
                'notified': false
            });

            return db.insertOrReplace().into(item).values([row]).exec();
        }).then(function() {
            onSuccess();
        });
    };

    factory.fetchAll = function() {
        var schemaBuilder = factory.schemaBuilder;
        var item;
        return schemaBuilder.connect().then(function(db) {
            item = db.getSchema().table('Item');
            return db.select().from(item).orderBy(item.id, lf.Order.DESC).exec();
        });
    };

    factory.deleteTask = function(id, onSuccess) {
        var schemaBuilder = factory.schemaBuilder;
        var item;
        schemaBuilder.connect().then(function(db) {
            item = db.getSchema().table('Item');
            return db.delete().from(item).where(item.id.eq(id)).exec();
        }).then(function() {
            onSuccess();
        });
    };

    factory.doneTask = function(id, onSuccess) {
        var schemaBuilder = factory.schemaBuilder;
        var item;
        schemaBuilder.connect().then(function(db) {
            item = db.getSchema().table('Item');
            return db.update(item).set(item.done, true).set(item.notified, true).where(item.id.eq(id)).exec();
        }).then(function() {
            onSuccess();
        });
    };

    factory.fetchNewTask = function(time) {
        var schemaBuilder = factory.schemaBuilder;
        var item;
        return schemaBuilder.connect().then(function(db) {
            item = db.getSchema().table('Item');
            return db.select()
                        .from(item)
                            .where(lf.op.and(item.done.eq(false), item.deadline.eq(time), item.notified.eq(false)))
                                .exec();
        });
    };

    factory.updateNewTask = function(time) {
        var schemaBuilder = factory.schemaBuilder;
        var item;
        return schemaBuilder.connect().then(function(db) {
            item = db.getSchema().table('Item');
            console.log(time);
            return db.update(item)
                        .set(item.notified, 1)
                            .where(lf.op.and(item.done.eq(false), item.deadline.eq(time), item.notified.eq(false)))
                                .exec();
        });
    };

    return factory;
});