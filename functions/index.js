'use strict';
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

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

function convertRecordedAt(date) {
  const d = moment(date.substr(0, 8) + ' ' + date.substr(8));
  return d.format('YYYY年MM月DD日のHH時mm分');
}

function replyCourseRecord(courseRecord) {
  let reply = '';
  if (courseRecord.exists) {
    const best = courseRecord.data();
    let recordedAt = convertRecordedAt(best.lapTime.recordedAt);
    reply = `もっとも速かったラップタイムは${recordedAt}の${parseFloat(best.lapTime.time).toFixed(2)}です。`;
    recordedAt = convertRecordedAt(best.totalTime.recordedAt);
    reply += `もっとも速かったトータルタイムは${recordedAt}の${parseFloat(best.totalTime.time).toFixed(2)}です。`;
    return reply;
  } else {
    return 'いまのところ、記録はありません。';
  }
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

const {WebhookClient} = require('dialogflow-fulfillment');

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });

  function welcome(agent) {
    agent.add(`こんにちは、コースマネージャです。`);
  }

  function fallback(agent) {
    agent.add(`わかりません。`);
    agent.add(`ごめんなさい。もう一度お願いします。`);
  }

  function queryCourseRecord(agent) {
    console.log('call queryCourseRecord');
    return db.collection('results').doc('CourseRecord').get()
      .then(courseRecord => {
        agent.add(replyCourseRecord(courseRecord));
        return Promise.resolve('complete');
      })
      .catch(error => {
        agent.add(error.message);
      });
  }
  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('queryCourseRecord', queryCourseRecord);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});

exports.debug = functions.https.onRequest((request, response) => {
  db.collection('results').doc('CourseRecord').get()
    .then(courseRecord => {
      response.send(replyCourseRecord(courseRecord));
    })
    .catch(error => {
      response.send(error.message);
    });
});
