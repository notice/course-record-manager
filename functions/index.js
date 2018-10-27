const admin = require('firebase-admin');
const functions = require('firebase-functions');
const moment = require('moment');

admin.initializeApp(functions.config().firebase);
let db = admin.firestore();

exports.alive = functions.https.onRequest((request, response) => {
  response.send("alive");
});

function createNewRecord(results) {

  const lapTimes = results.split(',').map(t => { return +t; });

  if (lapTimes.length > 0) {

    let bestLapTime = lapTimes[0];
    let bestLapNo = 0;
    let totalTime = 0.0;
    lapTimes.forEach((time, no) => {
      if (bestLapTime > time) {
        bestLapTime = time;
        bestLapNo = no;
      }
      totalTime += time;
    });

    return {
      recordedAt: moment().utcOffset('+0900').format('YYYYMMDDHHmmss'),
      times: lapTimes,
      totalTime: totalTime,
      averageTime: totalTime / lapTimes.length,
      bestLapNo: bestLapNo + 1,
      bestLapTime: bestLapTime
    };
  }
  return null;
}

function updateBestTime(best, record) {
  if ('lapTime' in best) {
    if (best.lapTime.time > record.bestLapTime) {
      best.lapTime = {
        recordedAt: record.recordedAt,
        lapNo: record.bestLapNo,
        time: record.bestLapTime
      };
    }
  } else {
    best.lapTime = {
      recordedAt: record.recordedAt,
      lapNo: record.bestLapNo,
      time: record.bestLapTime
    };
  }

  if ('totalTime' in best) {
    if (best.totalTime.time > record.totalTime) {
      best.totalTime = {
        recordedAt: record.recordedAt,
        time: record.totalTime
      };
    }
  } else {
    best.totalTime = {
      recordedAt: record.recordedAt,
      time: record.totalTime
    };
  }
  return best;
}

exports.uploadResults = functions.https.onRequest((request, response) => {

  if (request.query.results) {
    const record = createNewRecord(request.query.results);
    if (record) {
      db.collection('results').doc(record.recordedAt).set(record)
        .then(() => {
          db.collection('results').doc('CourseRecord').get()
            .then(best => {
              const latest = updateBestTime(best.exists ? best.data() : {}, record);
              db.collection('results').doc('CourseRecord').set(latest)
                .then(() => {
                  response.send(record);
                });
              });
            });
    } else {
      response.send("no record.");
    }
  } else {
    response.send("no results.");
  }
});
