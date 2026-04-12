# Template Engine Benchmark

This project is a benchmark designed to evaluate the performance of various JavaScript template engines. It allows developers to compare rendering performance of several popular template engines in various scenarios.

## How to use ?

**1. Clone this repo on your machine:**
```bash
git clone https://github.com/itsarnaud/templating-engine-bench.git
```

**2. Install dependencies:**
```bash
npm install
```

**3. Launch the benchmark by executing:**
```bash
node main.js
```

**4. Results:<br/>**
Once the benchmark is completed, the results will be automatically updated in the readme file.

## Current results

The tests were carried out on:
- Node v21.7.2
- MacBook Air M2, 15-inch with 16GB of RAM (2023)

<!-- <render performance> -->
## RENDER 

### friends (runned 2000 times) 
`astro` => **319ms** <br/> 
`pug` => **332ms** <br/> 
`eta` => **334ms** <br/> 
`igodust` => **405ms** <br/> 
`handlebars` => **916ms** <br/> 
`dustjs` => **978ms** <br/> 
`ejs` => **2601ms** <br/> 
`liquidjs` => **11976ms** <br/> 

### if-expression (runned 2000 times) 
`astro` => **2ms** <br/> 
`dustjs` => **8ms** <br/> 
`igodust` => **9ms** <br/> 
`pug` => **9ms** <br/> 
`eta` => **50ms** <br/> 
`ejs` => **82ms** <br/> 
`liquidjs` => **84ms** <br/> 

### projects-escaped (runned 2000 times) 
`astro` => **18ms** <br/> 
`handlebars` => **34ms** <br/> 
`igodust` => **34ms** <br/> 
`dustjs` => **38ms** <br/> 
`eta` => **76ms** <br/> 
`pug` => **101ms** <br/> 
`ejs` => **128ms** <br/> 
`liquidjs` => **137ms** <br/> 

### projects-unescaped (runned 2000 times) 
`igodust` => **8ms** <br/> 
`dustjs` => **13ms** <br/> 
`astro` => **15ms** <br/> 
`handlebars` => **31ms** <br/> 
`eta` => **66ms** <br/> 
`pug` => **99ms** <br/> 
`ejs` => **121ms** <br/> 
`liquidjs` => **129ms** <br/> 

### search-results (runned 2000 times) 
`igodust` => **36ms** <br/> 
`pug` => **37ms** <br/> 
`astro` => **45ms** <br/> 
`dustjs` => **86ms** <br/> 
`eta` => **91ms** <br/> 
`handlebars` => **118ms** <br/> 
`ejs` => **404ms** <br/> 
`liquidjs` => **1117ms** <br/> 

### simple-0 (runned 2000 times) 
`astro` => **1ms** <br/> 
`dustjs` => **1ms** <br/> 
`pug` => **2ms** <br/> 
`igodust` => **6ms** <br/> 
`handlebars` => **8ms** <br/> 
`liquidjs` => **15ms** <br/> 
`ejs` => **25ms** <br/> 
`eta` => **30ms** <br/> 

### simple-1 (runned 2000 times) 
`astro` => **4ms** <br/> 
`pug` => **6ms** <br/> 
`dustjs` => **10ms** <br/> 
`igodust` => **10ms** <br/> 
`handlebars` => **17ms** <br/> 
`eta` => **51ms** <br/> 
`liquidjs` => **94ms** <br/> 
`ejs` => **107ms** <br/> 

### simple-2 (runned 2000 times) 
`astro` => **3ms** <br/> 
`pug` => **6ms** <br/> 
`dustjs` => **9ms** <br/> 
`igodust` => **9ms** <br/> 
`handlebars` => **13ms** <br/> 
`eta` => **52ms** <br/> 
`liquidjs` => **87ms** <br/> 
`ejs` => **96ms** <br/> 

<!-- <end> -->

## Adding a new Template Engine

To add a new template engine to this project, follow these simple steps:

**1. Create a file for the template engine:<br/>**
In the `engines` directory, create a new file named after your template engine, for example `my-engine.js`. Take a look at the files already created for the syntax.

```
engines
 ├── igodust.js
 ├── my-engine.js
 └── ...
```
**⚠️ WARNING: Asynchronous rendering methods, such as those returning Promises, are not supported by the benchmarking tool at the moment. Ensure that your rendering method is synchronous to work with the benchmarking tool effectively. ⚠️**

**2. Add test templates: <br/>**
Place your template files in the templates directory, following the existing structure. Each test group should have a data file (.js or .json) and template files for each template engine you want to include in the benchmark.

```
templates
 ├── group1
 │   ├── data.js (or json)
 │   ├── template.dust
 │   ├── template.my-engine
 │   └── ...
 └── ...
```

 And that's it, all you have to do is launch the benchmark!

 PRs are welcome 😃❤️
