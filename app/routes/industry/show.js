import Ember from 'ember';
import ENV from '../../config/environment';
const {apiURL} = ENV;
const {computed, RSVP, get, getWithDefault, $} = Ember;

export default Ember.Route.extend({
  i18n: Ember.inject.service(),
  featureToggle: Ember.inject.service(),

  firstYear: computed.alias('featureToggle.first_year'),
  lastYear: computed.alias('featureToggle.last_year'),
  employmentGrowthCalc: function(data) {
    let first = _.first(data);
    let last = _.last(data);
    let difference = last.employment / first.employment;
    let power =  1/(data.length-1);
    return (Math.pow(difference, power) - 1);
  },
  model: function(params) {
    var industriesMetadata = this.modelFor('application').industries;
    var classMetadata = $.getJSON(`${apiURL}/data/industry?level=class`);
    return RSVP.hash({
      model: this.store.find('industry', params.industry_id),
      classMetadata: classMetadata
    }).then((hash) => {
      let model = hash['model'];
      let data = _.groupBy(hash['classMetadata'].data, 'industry_id');

      var groupIds = _.pluck(_.filter(industriesMetadata, 'parent_id', parseInt(model.id)), 'id');
      var classIndustries = _.filter(industriesMetadata, function(d) {
        return _.contains(groupIds, d.id);
      });

      let classData = _.reduce(classIndustries, (memo, d) => {
        let classData = data[d.id];
        if(!classData) { return memo; }

        let lastClassData = _.last(classData);
        d.employment_growth = this.employmentGrowthCalc(classData);
        d.avg_wage = lastClassData.monthly_wages;
        memo.push(_.merge(d, lastClassData));
        return memo;
      },[]);

      model.set('classIndustries', classData);
      return model;
    });
  },
  afterModel: function(model) {

    var departments = $.getJSON(`${apiURL}/data/industry/${model.id}/participants?level=department`);
    var industries = $.getJSON(`${apiURL}/data/industry?level=${model.get('level')}`);
    var occupations = $.getJSON(`${apiURL}/data/industry/${model.id}/occupations/?level=minor_group`);

    return RSVP.allSettled([departments, industries, occupations]).then((array) => {
      var departmentsData = getWithDefault(array[0], 'value.data', []);
      var industriesData = getWithDefault(array[1], 'value.data', []);
      var occupationsData = getWithDefault(array[2], 'value.data', []);

      let locationsMetadata = this.modelFor('application').locations;
      let industriesMetadata = this.modelFor('application').industries;
      let occupationsMetadata = this.modelFor('application').occupations;


      //get products data for the department
      let departments = _.reduce(departmentsData, (memo, d) => {
        let department  = locationsMetadata[d.department_id];
        department.parent_name_en = department.name_short_en;
        department.parent_name_es = department.name_short_es;

        department.group = department.code;
        memo.push(_.merge(d, department));
        return memo;
      },[]);

      let industries = _.map(industriesData, function(d) {
        d.avg_wage = d.monthy_wages;
        return  _.merge(d, industriesMetadata[d.industry_id]);
      });

      let occupations = _.map(occupationsData, (d) => {
        let occupation = occupationsMetadata[d.occupation_id];
        let parent =  get(occupationsMetadata, `${occupation.parent_id}`);
        d.year = this.get('lastYear');
        d.group = parent.code;

        d.color = occupation.color;
        d.code = occupation.code;
        d.parent_name_en = parent.name_en;
        d.parent_name_es = parent.name_es;
        d.name_short_en = occupation.name_short_en;
        d.name_short_es = occupation.name_short_es;
        return d;
      });

      model.set('departmentsData', departments);
      model.set('industriesData', industries);
      model.set('occupationsData', occupations);
      return model;
    });
  },
  setupController(controller, model) {
    this._super(controller, model);
    this.controllerFor('application').set('entity', model.get('constructor.modelName'));
    this.controllerFor('application').set('entity_id', model.get('id'));
    window.scrollTo(0, 0);
  },
});

