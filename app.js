(function() {

  var self = this;

  return {

    events: {
      'click #generate': 'findAudits'
    },

    requests: {
      'getAudits': function(id, page) {
        return {
          url  : helpers.fmt('/api/v2/tickets/%@/audits.json?page=%@', id, page),
          type : 'GET'
        };
      },
      'getComments': function(id, page) {
        return {
          url  : helpers.fmt('/api/v2/tickets/%@/comments.json?page=%@', id, page),
          type : 'GET'
        };
      },
      'getUser': function(id){
        return {
          url  : helpers.fmt('/api/v2/users/%@.json', id),
          type : 'GET'
        };
      }
    },

    findAudits: function() {
      this.switchTo('loading');
      var id = this.ticket().id();
      // kick off the chain of requests to aggregate audit data
      var audits = this.paginate({ request : 'getAudits',
                                   entity  : 'audits',
                                   id      : id,
                                   page    : 1 });

      audits.done(_.bind(function(data){
        this.findMergeEvents({ audits : data });
      }, this));
    },

    findMergeEvents: function(data) {
      // find merge events in audits
      var merges = _.chain(data.audits)
                    .flatten()
                    .filter(function(audit){
                      return audit.via.source.rel === 'merge' && audit.via.source.from.ticket_ids;
                     })
                    .value();
      // get comments associated with losing tickets...
      if (merges.length > 0) {
        this.findComments({ merges : merges });
      //...or pass a null value; we only need comments for the current ticket
      } else {
        this.findComments({ merges : null });
      }
    },

    findComments: function(data) {
      // get losing ticket ids from merge events if they exist
      var tickets = data.merges ? _.chain(data.merges)
                                   .map(function(merge){
                                     return merge.via.source.from.ticket_ids;
                                   })
                                   .flatten()
                                   .value() : [];
      var id = this.ticket().id();
      tickets.push(id);
      // create a paginated AJAX request for each ticket id
      var requests = [];
      for (var i = 0; i < tickets.length ; ++i) {
        requests.push(this.paginate({ request : 'getComments',
                                      entity  : 'comments',
                                      id      : tickets[i],
                                      page    : 1 }));
      }
      // when the requests complete, start finding the names of the comment authors
      this.when.apply(this, requests).done(_.bind(function(){
        this.findAuthors({ comments      : _.flatten(arguments),
                           mergedTickets : tickets });
      }, this))
      .fail(_.bind(function(){
        var message = 'Unable to generate threaded comment report - ' +
                      'this ticket contains merges from tickets that have been deleted.';
        this.switchTo('error', { message: message });
      }, this));

    },

    findAuthors: function(data) {
      var users = _.chain(data.comments)
                   .map(function(comment){
                     return comment.author_id;
                   })
                   .uniq()
                   .value();
      var requests = [];
      for (var i = 0; i < users.length; ++i){
        requests.push(this.ajax('getUser', users[i]));
      }
      this.when.apply(this, requests).done(_.bind(function(){
        // generate a lookup object for comment author names
        var authorLookup = _.chain(arguments)
                            .flatten()
                            .filter(function(result){
                              return result.user;
                            })
                            .map(function(result){
                              return _.pick(result.user, 'name', 'id');
                            })
                            .reduce(function(memo, result){
                                memo[result.id] = result.name;
                                return memo; }, {}
                             )
                            .value();
        this.prepareData({ comments      : data.comments,
                           mergedTickets : data.mergedTickets,
                           authors       : authorLookup });
      }, this));
    },

    prepareData: function(data) {
      // transform comments by adding author name and making a pretty date
      _.each(data.comments, function(comment){
          comment.author_name = data.authors[comment.author_id];
          comment.pretty_date  = comment.created_at
          .split('T').join(' ').replace('Z', '  UTC');
          return comment;
        });
      // sort comments, parsing epoch from the date
      var sorted = _.sortBy(data.comments, function(comment){
          return Date.parse(comment.created_at);
        }).reverse();
      // create an object to hold sorted comments and data from current ticket
      var ticket = this.ticket();
      var templateData = { comments       : sorted,
                           mergedTickets  : data.mergedTickets.join(", "),
                           id             : ticket.id(),
                           status         : ticket.status() || '-',
                           type           : ticket.type() || '-',
                           assignee       : ticket.assignee().user().name() || '-',
                           group          : ticket.assignee().group().name() || '-',
                           priority       : ticket.priority() || '-',
                           requesterName  : ticket.requester().name() || '-',
                           requesterEmail : ticket.requester().email() || '-',
                           subject        : ticket.subject()
                         };
      this.generateReport(templateData);
    },

    generateReport: function(templateData) {
      // construct HTML string
      var header = this.setting('header');
      var footer = this.setting('footer');
      // render dynamic data
      var body   = this.renderTemplate('body', templateData);
      var contents = header + body + footer;
      // create Blob from HTML string
      var blob = new self.Blob([contents], {type: 'text/html'});
      var encoded = self.URL.createObjectURL(blob);
      // present link to Blob in interface
      this.switchTo('link', { href: encoded });
    },

    paginate: function(a) {
      var results = [];
      var initialRequest = this.ajax(a.request, a.id, a.page);
      // create and return a promise chain of requests to subsequent pages
      var allPages = initialRequest.then(function(data){
        results.push(data[a.entity]);
        var nextPages = [];
        var pageCount = Math.ceil(data.count / 100);
        for (; pageCount > 1; --pageCount) {
          nextPages.push(this.ajax(a.request, a.id, pageCount));
        }
        return this.when.apply(this, nextPages).then(function(){
          var entities = _.chain(arguments)
                          .flatten()
                          .filter(function(item){
                            return (_.isObject(item) && _.has(item, a.entity));
                          })
                          .map(function(item){
                            return item[a.entity];
                          })
                          .value();
          results.push(entities);
        }).then(function(){
          return _.chain(results)
                  .flatten()
                  .compact()
                  .value();
          });
        });
      return allPages;
    },

  };

}());
