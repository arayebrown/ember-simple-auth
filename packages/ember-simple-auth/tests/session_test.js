var session;

function mockPromise(resolveWith, rejectWith) {
  return new Ember.RSVP.Promise(function(resolve, reject) {
    if (!Ember.isEmpty(resolveWith) && !!resolveWith) {
      resolve(resolveWith);
    } else {
      reject(rejectWith);
    }
  });
}

var containerMock;
var ContainerMock = Ember.Object.extend({
  lookup: function(name) {
    return ContainerMock._lookupResult;
  }
});

var storeMock;
var StoreMock = Ember.SimpleAuth.Stores.Ephemeral.extend({
  restore: function() {
    this.restoreInvoked = true;
    return this._super();
  }
});

var authenticatorMock;
var AuthenticatorMock = Ember.Object.extend(Ember.Evented, {
  restore: function(content) {
    return mockPromise(AuthenticatorMock._resolve);
  },
  authenticate: function(properties) {
    this.authenticateInvoked     = true;
    this.authenticateInvokedWith = properties;
    return mockPromise(AuthenticatorMock._resolve, AuthenticatorMock._reject);
  },
  invalidate: function(properties) {
    this.invalidateInvoked     = true;
    this.invalidateInvokedWith = properties;
    return mockPromise(AuthenticatorMock._resolve);
  }
});

module('Ember.SimpleAuth.Session', {
  setup: function() {
    window.AuthenticatorMock = AuthenticatorMock;
    authenticatorMock        = AuthenticatorMock.create();
    storeMock                = StoreMock.create();
    containerMock            = ContainerMock.create();
    Ember.run(function() {
      session = Ember.SimpleAuth.Session.create({ authenticator: authenticatorMock, store: storeMock, container: containerMock });
    });
  },
  teardown: function() {
    delete window.AuthenticatorMock;
    delete window.Authenticators;
  }
});

test('it is not authenticated when just created', function() {
  session = Ember.SimpleAuth.Session.create({ store: storeMock, container: containerMock });

  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when just created.');
});

test('restores its state during initialization', function() {
  storeMock.persist({ authenticator: 'AuthenticatorMock' });
  AuthenticatorMock._resolve = { some: 'content' };
  ContainerMock._lookupResult = authenticatorMock;
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock, container: containerMock });
  });

  ok(storeMock.restoreInvoked, 'Ember.Session restores its content from the store during initialization.');
  deepEqual(session.get('authenticator'), authenticatorMock, 'Ember.Session restores the authenticator by retrieving it from the container with the key read from the store during initialization.');
  ok(session.get('isAuthenticated'), 'Ember.Session is authenticated when the restored authenticator resolves during initialization.');
  deepEqual(session.get('content'), { some: 'content' }, 'Ember.Session sets its content when the restored authenticator resolves during initialization.');

  AuthenticatorMock._resolve = false;
  storeMock.persist({ key1: 'value1' });
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock, container: containerMock });
  });

  equal(session.get('authenticator'), null, 'Ember.Session does not assign the authenticator during initialization when the authenticator rejects.');
  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when the restored authenticator rejects during initialization.');
  equal(session.get('content'), null, 'Ember.Session does not set its content when the restored authenticator rejects during initialization.');
  equal(storeMock.restore().key1, null, 'Ember.Session clears the store when the restored authenticator rejects during initialization.');
});

test('authenticates itself with an authenticator', function() {
  var resolved;
  AuthenticatorMock._resolve = { key: 'value' };
  Ember.run(function() {
    session.authenticate(authenticatorMock).then(function() {
      resolved = true;
    });
  });

  ok(authenticatorMock.authenticateInvoked, 'Ember.Session authenticates itself with the passed authenticator.');
  ok(session.get('isAuthenticated'), 'Ember.Session is authenticated when the authenticator resolves.');
  equal(session.get('key'), 'value', 'Ember.Session saves all properties that the authenticator resolves with.');
  equal(session.get('authenticator'), authenticatorMock, 'Ember.Session saves the authenticator when the authenticator resolves.');
  ok(resolved, 'Ember.Session returns a resolving promise when the authenticator resolves.');

  var rejected;
  var rejectedWith;
  AuthenticatorMock._resolve = false;
  AuthenticatorMock._reject = { error: 'message' };
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock, container: containerMock });
    session.authenticate(authenticatorMock).then(function() {}, function(error) {
      rejected     = true;
      rejectedWith = error;
    });
  });

  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when the authenticator rejects.');
  equal(session.get('authenticator'), null, 'Ember.Session does not save the authenticator when the authenticator rejects.');
  ok(rejected, 'Ember.Session returns a rejecting promise when the authenticator rejects.');
  deepEqual(rejectedWith, { error: 'message'}, 'Ember.Session returns a promise that rejects with the error that the authenticator rejects with.');
});

test('invalidates itself', function() {
  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.authenticate(authenticatorMock);
  });
  AuthenticatorMock._resolve = false;
  AuthenticatorMock._reject = { error: 'message' };
  session.set('isAuthenticated', true);
  Ember.run(function() {
    session.set('content', { key: 'value' });
    session.invalidate();
  });

  ok(authenticatorMock.invalidateInvoked, 'Ember.Session invalidates with the passed authenticator.');
  deepEqual(authenticatorMock.invalidateInvokedWith, { key: 'value' }, 'Ember.Session passes its content to the authenticator to invalidation.');
  ok(session.get('isAuthenticated'), 'Ember.Session remains authenticated when the authenticator rejects invalidation.');
  equal(session.get('authenticator'), authenticatorMock, 'Ember.Session does not unset the authenticator when the authenticator rejects invalidation.');

  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.invalidate();
  });

  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when invalidation with the authenticator resolves.');
  equal(session.get('aurhenticator'), null, 'Ember.Session unsets the authenticator when invalidation with the authenticator resolves.');
  equal(session.get('content'), null, 'Ember.Session unsets its content when invalidation with the authenticator resolves.');

  Ember.run(function() {
    authenticatorMock.trigger('ember-simple-auth:session-updated', { key: 'other value' });
  });

  equal(session.get('key'), null, 'Ember.Session stops listening to the "ember-simple-auth:session-updated" event of the authenticator when invalidation with the authenticator resolves.');
});

test('observes changes of the observer', function() {
  window.Authenticators                        = Ember.Namespace.create();
  window.Authenticators.OtherAuthenticatorMock = AuthenticatorMock.extend();
  var otherAuthenticatorMock                   = window.Authenticators.OtherAuthenticatorMock.create();
  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.authenticate(otherAuthenticatorMock).then(function() {
      otherAuthenticatorMock.trigger('ember-simple-auth:session-updated', { key: 'value' });
    });
  });

  equal(session.get('key'), 'value', 'Ember.Session subscribes to the "ember-simple-auth:session-updated" of the authenticator when it is assigned.');
  equal(storeMock.restore().authenticator, 'Authenticators.OtherAuthenticatorMock', "Ember.Session saves the authenticator's prototype to the store when it is assigned.");
});
