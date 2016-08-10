var db = require('./pghelper'),
    winston = require('winston'),
    qrCode = require('qrcode-npm');

const APP_NAME = 'Heineken';

function getCoupon(coupon) {
    return db.query('select id, eitech__campaign__c as campaign, eitech__consommateur__r__eitech__loyaltyid__c as consommateur, eitech__date_de_consommation__c as date, eitech__commercant__r__eitech__loyaltyid__c as commercant from salesforce.eitech__coupon__c where  eitech__campaign__c=$1 and eitech__consommateur__r__eitech__loyaltyid__c=$2', [coupon.offerId, coupon.consommateur]);
}

function findById(id, userId) {
	return db.query('select id, eitech__campaign__c as campaign, eitech__consommateur__r__eitech__loyaltyid__c as consommateur, eitech__date_de_consommation__c as date, eitech__commercant__r__eitech__loyaltyid__c as commercant, eitech__Secret__c as secret from salesforce.eitech__coupon__c where id = $1 and eitech__consommateur__r__eitech__loyaltyid__c = $2', [id, userId], true);
}


function createCoupon(coupon) {

	return getCoupon(coupon).then(function (coupons) {

		var retVal;
		if (coupons.length > 0) {
			var existingCoupon = coupons[0];

			retVal = coupons[0].id;
		} else {
			 retVal = db.query('INSERT INTO salesforce.eitech__coupon__c(eitech__campaign__c, eitech__consommateur__r__eitech__loyaltyid__c, eitech__Secret__c) VALUES ($1, $2, floor(random() * 1E10)) RETURNING id, eitech__campaign__c as campaign, eitech__consommateur__r__eitech__loyaltyid__c as consommateur, eitech__Secret__c as secret', [coupon.offerId,  coupon.consommateur]).then(function (insertedCoupon) {
				winston.info("Inserted coupon: " + JSON.stringify(insertedCoupon));

				return insertedCoupon[0].id;

			});

		}
		return retVal;
	});

}


/**
 * @param req
 * @param res
 * @param next
 */
function addItem(req, res, next) {
    var userId = req.externalUserId,
        coupon = req.body;
    coupon.consommateur = userId;

	createCoupon(coupon).then(function(id) {
		res.send(JSON.stringify({id: id}))
	}).catch(next);
}

function getImage(coupon) {
	var qr = qrCode.qrcode(10, 'M');
	qr.addData(JSON.stringify({app: APP_NAME, id: coupon.id, secret: coupon.secret}));
	qr.make();

	return qr.createImgTag(4).match(/.*src="data:image\/gif;base64,([\w+/=]*)".*/)[1];
}

function getById(req, res, next) {
	var id = req.params.id;
	var userId = req.externalUserId;
	findById(id, userId)
		.then(function (coupon) {
        var text = JSON.stringify(coupon);
		console.log(text);
		if(coupon.date == null) {

			coupon.base64 = getImage(coupon);
		}

		return res.send(JSON.stringify(coupon));
	})
		.catch(next);
}

function check(req, res, next) {
    var couponInfo = req.body;
    var res;
    if(couponInfo.app != APP_NAME) {
      res = {valid: false, cause: 'Not a Heineken coupon'};
      res.send(JSON.stringify(res));
      return;
    }
    db.query('select coupon.id, coupon.eitech__campaign__c as campaign, coupon.eitech__consommateur__r__eitech__loyaltyid__c as consommateur, coupon.eitech__date_de_consommation__c as date, coupon.eitech__commercant__r__eitech__loyaltyid__c as commercant, coupon.eitech__Secret__c as secret, campaignT.name as name, campaignT.description as description, campaignT.startdate, campaignT.enddate from salesforce.eitech__coupon__c coupon, salesforce.campaign campaignT where coupon.id = $1 and coupon.eitech__Secret__c = $2 and coupon.eitech__campaign__c = campaignT.sfid', [couponInfo.id, couponInfo.secret]).then(function(results) {

      if(results.length == 0) {
        res = {valid: false, cause: 'Coupon not found'};
        res.send(JSON.stringify(res));
        return;
      }


      var coupon = results[0];
      winston.info("startDate: " + coupon.startdate + " type: " + (typeof coupon.startdate));
      winston.info(Date.now() > coupon.startdate);
      res = {valid: true, name: coupon.name, description: coupon.description};
      res.send(JSON.stringify(res));
      winston.info("sent: " + JSON.stringify(res));
      return;
    });
}


exports.addItem = addItem;
exports.getById = getById;
exports.createCoupon = createCoupon;
exports.getImage = getImage;
exports.check = check;
