import Ember from 'ember';

const { RSVP } = Ember;

export default class Queue {
  constructor() {
    this.reset();
  }

  reset() {
    this.tasks = [];
    this.isActive = true;
    this.afterPaintDeferred = RSVP.defer();
    this.afterPaintPromise = this.afterPaintDeferred.promise;
  }
}
