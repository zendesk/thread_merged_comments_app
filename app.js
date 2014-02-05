(function() {

  var self = this;

  return {

    events: {
      'click #generate': 'findAudits'
    },

    requests: {
      'getAudits': function(id) {
        return {
          url  : helpers.fmt('/api/v2/tickets/%@/audits.json', id),
          type : 'GET'
        };
      },
      'getComments': function(id) {
        return {
          url  : helpers.fmt('/api/v2/tickets/%@/comments.json', id),
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
      // kick off the chain of requests to aggregate necessary data
      var audits = this.paginate({ request : 'getAudits',
                                   entity  : 'audits',
                                   id      : id });
      // when all the audits have returned, extract merge events
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
      //...or display an error if there are no merge events
      } else {
        var message = 'Unable to generate threaded comment report - ' +
                      'no tickets have been merged into this one.';
        this.switchTo('error', { message: message });
      }
    },

    findComments: function(data) {
      // get losing ticket ids from merge events
      var tickets = _.chain(data.merges)
                     .map(function(merge){ return merge.via.source.from.ticket_ids; })
                     .flatten()
                     .value();
      var id = this.ticket().id();
      tickets.push(id);
      // create a paginated AJAX request for each ticket id
      var requests = [];
      for (var i = 0; i < tickets.length ; ++i) {
        requests.push(this.paginate({ request : 'getComments',
                                      entity  : 'comments',
                                      id      : tickets[i] }));
      }
      // when the requests complete, start finding the names of the comment authors
      this.when.apply(this, requests).done(_.bind(function(){
        this.findAuthors({ comments      : _.flatten(arguments),
                           mergedTickets : tickets });
      }, this));

    },

    findAuthors: function(data) {
      var users = _.map(data.comments, function(comment){ return comment.author_id; });
      var requests = [];
      for (var i = 0; i < users.length; ++i){
        requests.push(this.ajax('getUser', users[i]));
      }
      this.when.apply(this, requests).done(_.bind(function(){
        // generate a lookup object for comment author names
        var authorLookup = _.chain(arguments)
                            .flatten()
                            .filter(function(result){ return result.user; })
                            .map(function(result){ return _.pick(result.user, 'name', 'id'); })
                            .reduce(
                              function(memo, result){ 
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
      // transform comments by adding author name and making date more readable
      _.each(data.comments, function(comment){ comment.author_name = data.authors[comment.author_id];
                                               comment.created_at  = comment.created_at
                                               .split('T').join(' ').replace('Z', '  UTC');
                                               return comment; });
      // sort comments, using ID as a proxy for date
      var sorted = _.sortBy(data.comments, function(comment){ return comment.id; }).reverse();
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
      var initialRequest = this.ajax(a.request, a.id);
      // create and return a promise chain of requests to subsequent pages
      var allPages = initialRequest.then(function(data){
        results.push(data[a.entity]);
        var nextPages = [];
        var pageCount = Math.floor(data.count / 100) + 1;
        for (; pageCount > 1; --pageCount) {
          nextPages.push(this.ajax(a.request, a.id + '?page=' + pageCount));
        }
        return this.when.apply(this, nextPages).then(function(data){
          results.push(data ? data[a.entity] : null);
        }).then(function(){ 
          return _.compact(results); 
          });
        });
      return allPages;
    },

  };

}());
