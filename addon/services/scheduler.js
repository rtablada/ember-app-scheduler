import Ember from 'ember';
import { DEBUG } from '@glimmer/env';
import Queue from '../queue';
import Token from '../token';

const {
  run,
  RSVP,
  Service,
} = Ember;

const Scheduler = Service.extend({
  init() {
    this._super();

    this.afterFirstRoutePaint = new Queue();
    this.afterContentPaint = new Queue();
    this._nextPaintFrame = null;
    this._nextPaintTimeout = null;
    this._nextAfterPaintPromise = null;
    this._routerWillTransitionHandler = null;
    this._routerDidTransitionHandler = null;
    this._useRAF = typeof requestAnimationFrame === "function";

    this._connectToRouter();
  },

  scheduleWork(queueName, callback) {
    const queue = this[queueName];
    const token = new Token();

    if (queue.isActive) {
      queue.tasks.push(callback);
      queue.tasks.push(token);
    } else {
      callback();
    }

    return token;
  },

  cancelWork(token) {
    token.cancel();
  },

  flushQueue(queueName) {
    const queue = this[queueName];
    queue.isActive = false;

    for (let i = 0; i < queue.tasks.length; i += 2) {
      const callback = queue.tasks[i];
      const token = queue.tasks[i+1];

      if (!token.cancelled) {
        callback();
      }
    }

    this._afterNextPaint()
      .then(() => {
        queue.afterPaintDeferred.resolve();
      });
  },

  _resetQueues() {
    this.afterFirstRoutePaint.reset();
    this.afterContentPaint.reset();
  },

  _afterNextPaint() {
    if (this._nextAfterPaintPromise) {
      return this._nextAfterPaintPromise;
    }

    this._nextAfterPaintPromise = new RSVP.Promise((resolve) => {
      if (this._useRAF) {
        this._nextPaintFrame = requestAnimationFrame(() => this._rAFCallback(resolve));
      } else {
        this._rAFCallback(resolve);
      }
    });

    return this._nextAfterPaintPromise;
  },

  _rAFCallback(resolve) {
    this._nextPaintTimeout = run.later(() => {
      this._nextAfterPaintPromise = null;
      this._nextPaintFrame = null;
      this._nextPaintTimeout = null;
      resolve();
    }, 0);
  },

  _connectToRouter() {
    const router = this.get('router');

    this._routerWillTransitionHandler = () => {
      this._resetQueues();
    };

    this._routerDidTransitionHandler = () => {
      this._afterNextPaint()
        .then(() => {
          this.flushQueue('afterFirstRoutePaint');
          this._afterNextPaint()
            .then(() => {
              this.flushQueue('afterContentPaint');
            });
        });
    };

    router.on('willTransition', this._routerWillTransitionHandler);
    router.on('didTransition', this._routerDidTransitionHandler);
  },

  willDestroy() {
    this._super();
    const router = this.get('router');
    this.afterFirstRoutePaint = null; // don't hold any references to uncompleted items
    this.afterContentPaint = null;

    router.off('willTransition', this._routerWillTransitionHandler);
    router.off('didTransition', this._routerDidTransitionHandler);

    if (this._useRAF) {
      cancelAnimationFrame(this._nextPaintFrame);
    }
    run.cancel(this._nextPaintTimeout);
  }
});

if (DEBUG) {
  Scheduler.reopen({
    init() {
      this._super(...arguments);

      if (Ember.testing) {
        this._waiter = () => {
          if (!this.afterFirstRoutePaint && !this.afterContentPaint) {
            return;
          }

          return !this.afterContentPaint.isActive;
        };
        Ember.Test.registerWaiter(this._waiter);
      }
    },

    willDestroy() {
      if (this._waiter) {
        Ember.Test.unregisterWaiter(this._waiter);
        this._waiter = null;
      }

      this._super(...arguments);
    }
  });
}

export default Scheduler;
