const xml2js = require('xml2js'),
      fs = require('fs'),
      path = require('path'),
      util = require('util'),
      toMarkdown = require('to-markdown'),
      http = require('http'),
      argv = require('minimist')(process.argv.slice(2));

let exportFile = 'export.xml',
    permalink = 'date';
    convertType = 'docpad';

init();



function init(){

    if(argv.h || argv.help) {
        displayHelp();
    }else{

        //check for type and file
        if(argv.t){

            if(argv.t === 'vuepress' || argv.t === 'docpad'){
                convertType = argv.t;
            }else{
                console.log(`ERROR: arg -t [Type] "${argv.t}" is not valid.  Use "docpad" (default) or "vuepress"`);

            }

        }

        if(argv.p){

            if(argv.p === 'flat'){
                permalink = 'flat'
            }else{
                console.log(`ERROR: arg -p [Permalink Structure] "${argv.p}" is not valid.  Use "date" (default) or "flat"`);

            }

        }

        if(argv.f && argv.f !== ''){
            exportFile = argv.f;
        }

        console.log(`Starting ${convertType} conversion of ${exportFile}...`);

        processExport();
    }
}

function displayHelp(){
    console.log('');
    console.log('WordPress to MarkDown conversion');
    console.log('================================');
    console.log('Default Use to convert a file called export.xml to docpad useable Markdown ');
    console.log('')
    console.log('node convert.js')
    console.log('')
    console.log('')
    console.log('Options:')

    console.log('-t [Type] "docpad" or "vuepress" - Changes output .md file: index.html.md for docpad, README.md for vuepress ');
    console.log('-p [Permalink] "date" or "flat" - /yyyy/mm/dd/a-post/ structure if date, /a-post/ if flat');
    console.log('-f [File] - the WordPress export XML file to convert');
    console.log('')

}


function processExport() {
	const parser = new xml2js.Parser();
    fs.readFile(exportFile, (err, data) => {
		if(err) {
			console.log('Error: ' + err);
		}

        parser.parseString(data, (err, result) => {
	    	if(err) {
	    		console.log('Error parsing xml: ' + err);
	    	}
	    	console.log('Parsed XML');
	        //console.log(util.inspect(result.rss.channel));

	        var posts = result.rss.channel[0].item;


            fs.mkdir('out', () => {
		        for(var i = 0; i < posts.length; i++) {
	        		processPost(posts[i]);
		        	//console.log(util.inspect(posts[i]));
		        }
			});
	    });
	});
}

function processPost(p) {
	console.log('Processing Post');
    const post = {
        title: p.title,
        date: new Date(p.pubDate),
        data: p['content:encoded'][0],
        slug: p['wp:post_name'],
        categories: []
    }

    console.log(post.title);


	//Merge categories and tags into tags
	if (p.category != undefined) {
		for(var i = 0; i < p.category.length; i++) {
			var cat = p.category[i]['_'];
			if(cat != "Uncategorized")
				post.categories.push(cat);
		}
	}

    const base = `out`; // out )
    let fullPath = '';


    if(permalink === 'date'){
        const yearDir = `${base}${path.sep}${post.date.getFullYear()}`; // out[\\|/]2018 (\\ for win, / for *nix
        const monthDir = `${yearDir}${path.sep}${getPaddedMonthNumber(post.date.getMonth() + 1)}`; // out[\\|/]2018[\\|/]01
        fullPath = `${monthDir}${path.sep}${post.slug}`;// out[\\|/]2018[\\|/]01[\\|/]a-post

        fs.mkdir(yearDir, () => {
            fs.mkdir(monthDir, () => {
                fs.mkdir(fullPath, () => {
                    convertToMD(post, fullPath);
                });
            });
        });
    }else if(permalink === 'flat'){
        fullPath = `${base}${path.sep}${post.slug}`;// out[\\|/]2018[\\|/]01[\\|/]a-post
        fs.mkdir(fullPath, () => {
            convertToMD(post, fullPath);
        });
    }


}

function convertToMD(post,fullPath){

    //Find all images
    var patt = new RegExp("(?:src=\"(.*?)\")", "gi");

    var m;
    var matches = [];
    while((m = patt.exec(post.data)) !== null) {
        matches.push(m[1]);
        //console.log("Found: " + m[1]);
    }


    if(matches != null && matches.length > 0) {
        for(var i = 0; i < matches.length; i++) {
            //console.log('Post image found: ' + matches[i])

            var url = matches[i];
            var urlParts = matches[i].split('/');
            var imageName = urlParts[urlParts.length - 1];

            var filePath = `${fullPath}${path.sep}${imageName}`;

            downloadFile(url, filePath);

            //Make the image name local relative in the markdown
            post.data = post.data.replace(url, imageName);
            //console.log('Replacing ' + url + ' with ' + imageName);
        }
    }

    var markdown = toMarkdown.toMarkdown(post.data);

    //Fix characters that markdown doesn't like
    // smart single quotes and apostrophe
    markdown = markdown.replace(/[\u2018|\u2019|\u201A]/g, "\'");
    // smart double quotes
    markdown = markdown.replace(/&quot;/g, "\"");
    markdown = markdown.replace(/[\u201C|\u201D|\u201E]/g, "\"");
    // ellipsis
    markdown = markdown.replace(/\u2026/g, "...");
    // dashes
    markdown = markdown.replace(/[\u2013|\u2014]/g, "-");
    // circumflex
    markdown = markdown.replace(/\u02C6/g, "^");
    // open angle bracket
    markdown = markdown.replace(/\u2039/g, "<");
    markdown = markdown.replace(/&lt;/g, "<");
    // close angle bracket
    markdown = markdown.replace(/\u203A/g, ">");
    markdown = markdown.replace(/&gt;/g, ">");
    // spaces
    markdown = markdown.replace(/[\u02DC|\u00A0]/g, " ");
    // ampersand
    markdown = markdown.replace(/&amp;/g, "&");

    var header = "";
    header += "---\n";
    header += "layout: post\n";
    header += "title: " + post.title + "\n";
    header += "date: " + post.date.getFullYear() + '-' + getPaddedMonthNumber(post.date.getMonth() + 1) + '-' + getPaddedDayNumber(post.date.getDate()) + "\n";
    if(post.categories.length > 0)
        header += "tags: " + JSON.stringify(post.categories) + '\n';
    header += "---\n";
    header += "\n";

    let outputFileName = 'index.html.md';

    if(convertType === 'vuepress'){
        outputFileName = 'README.md';
    }

    fs.writeFile(`${fullPath}${path.sep}${outputFileName}`, header + markdown, (err) => {
        console.log(`Error: ${err}`);
    });
}

function downloadFile(url, path) {
	 //console.log("Attempt downloading " + url + " to " + path + ' ' + url.indexOf("https:") );
	if (url.indexOf("https:")  == -1) {
		if (url.indexOf(".jpg") >=0 || url.indexOf(".png") >=0 || url.indexOf(".png") >=0) {
            var file = fs.createWriteStream(path).on('open', () => {
                var request = http.get(url, (response) => {
                    console.log("Response code: " + response.statusCode);
                    response.pipe(file);
                }).on('error', (err) => {
                    console.log('error downloading url: ' + url + ' to ' + path);
                });
            }).on('error', (err) => {
				console.log('error downloading url2: ' + url + ' to ' + path);
            });
        } else {
          console.log ('passing on: ' + url + ' ' + url.indexOf('https:'));
        }
	} else {
	  console.log ('passing on: ' + url + ' ' + url.indexOf('https:'));
	}
}

function getPaddedMonthNumber(month) {
    return ((month < 10) ? '0' : '') + month;
}

function getPaddedDayNumber(day) {
    return ((day < 10) ? '0' : '') + day;
}
