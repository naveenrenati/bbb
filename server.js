const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const multer = require('multer');
const aws = require('aws-sdk');
const { ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Configure AWS S3
aws.config.update({
  accessKeyId: '',
  secretAccessKey: '',
  region: 'ap-south-1', // Replace with your desired AWS region
});

const s3 = new aws.S3();

const uri = 'mongodb+srv://naveen:naveen@cluster0.5tln1lv.mongodb.net?retryWrites=true&w=majority'; // Replace with your MongoDB Atlas URI
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

app.use(bodyParser.json());
app.use(cors());

async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');


  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  }
}

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: 'admintable',
});

const userSchema = new mongoose.Schema({
  clientId: String,
  carrier: String,
  name: String,
  csvFileUrl: String,
  email: String,
  source : String,
  uploadDateTime: Date,
  destination : String,
  chargeCode :String,
  isDate : String,
  role:String,
});

const User = mongoose.model('User', userSchema);

const DataModel = mongoose.model('Data', {
  parameter: String,
  description: String,
});

const storage = multer.memoryStorage();

const personSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  phoneNumber: String,
  role: String,
  assignedTo: mongoose.Types.ObjectId,
});

const Person = mongoose.model('Person', personSchema);


const upload = multer({ storage: storage });

/////////////////////////////////////
/////////pdf upload////////////////
///////////////////////////////////


app.post('/upload/:email', upload.single('csvFile'), async (req, res) => {
  try {
    const { clientId, carrier, name, source, destination, chargeCode, isDate } = req.body;
    const csvFileData = req.file.buffer; // Use req.file.buffer to access the CSV file data
    const csvFileKey = `${clientId}-${Date.now()}.csv`; // Use .csv extension
    const uploadDateTime = new Date();
    const params = {
      Bucket: 'reactjsapp-naveen',
      Key: `pdfs/${csvFileKey}`, // Store CSVs in a 'csvs' directory
      Body: csvFileData,
    };

    await s3.upload(params).promise();

    const csvFileUrl = `https://reactjsapp-naveen.s3.ap-south-1.amazonaws.com/pdfs/${csvFileKey}`;

    const { email } = req.params;

    const user = new User({
      clientId,
      carrier,
      name,
      csvFileUrl, // Update to store the CSV file URL
      email,
      source,
      uploadDateTime,
      destination,
      chargeCode,
      isDate,
    });

    await user.save();
    res.status(201).json({ message: 'User data and CSV file link saved successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

///////////////////////
/////rate/////////////
/////////////////////


// API endpoint to get all data
app.get('/api/data', async (req, res) => {
  try {
    const data = await DataModel.find();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to add data
app.post('/api/data', async (req, res) => {
  try {
    const { parameter, description } = req.body;
    const newData = new DataModel({ parameter, description });
    await newData.save();
    res.status(201).send('Data added successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to delete data
app.delete('/api/data/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await DataModel.findByIdAndDelete(id);
    res.send('Data deleted successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

///////////////////////////
///////rate card matrix/////
///////////////////////////


// Define a schema for the matrix data
const matrixSchema = new mongoose.Schema({
  parameterNames: [String],
  zoneNames: [String],
  dataRate: [[String]],
});

const MatrixModel = mongoose.model('Matrix', matrixSchema);

// Route to save matrix data to MongoDB
app.post('/api/saveMatrix', async (req, res) => {
  const { parameterNames, zoneNames, dataRate } = req.body;

  const newMatrix = new MatrixModel({
    parameterNames,
    zoneNames,
    dataRate,
  });

  try {
    await newMatrix.save();
    res.status(200).json({ message: 'Matrix data saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error saving matrix data to the database' });
}
});



////////////////////
///////table///////
//////////////////
// 

app.get('/usertabledata/:email', async (req, res) => {
  const { email } = req.params;
  const db = client.db('admintable'); // Use the 'admintable' database

  try {
    // Find all documents in the 'users' collection that match the user's email
    const userTableData = await db.collection('users').find({ email }).toArray();
    res.status(200).json(userTableData);
  } catch (err) {
    console.error('Error fetching user table data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

///////////////////////
//////delete//////////
/////////////////////

app.delete('/delete/:email', async (req, res) => {
  const emailToDelete = req.params.email;
  const db = client.db('admintable'); // Replace 'admintable' with your database name
  const collection = db.collection('users');

  try {
    // Check if the user exists in the MongoDB collection
    const user = await collection.findOne({ email: emailToDelete });
    if (!user) {
      return res.status(404).json({ message: 'User data not found' });
    }

    const csvFileUrl = user.csvFileUrl;
    const csvFileKey = csvFileUrl.split('/').pop(); // Extract the file key from the URL

    // Delete the user's PDF file from S3
    const s3Params = {
      Bucket: 'reactjsapp-naveen', // Replace with your S3 bucket name
      Key: `pdfs/${csvFileKey}`,
    };

    s3.deleteObject(s3Params, (err, data) => {
      if (err) {
        console.error('Error deleting file from S3:', err);
        return res.status(500).json({ message: 'Failed to delete user data from AWS S3' });
      }

      // After successfully deleting the file from S3, delete the user data from the MongoDB collection
      collection.deleteOne({ email: emailToDelete }, (err, result) => {
        if (err) {
          console.error('Error deleting user data from MongoDB:', err);
          return res.status(500).json({ message: 'Failed to delete user data from MongoDB' });
        }

        // If both S3 and MongoDB deletions are successful, respond with a success message
        res.status(200).json({ message: 'User data and file deleted successfully' });
      });
    });
  } catch (err) {
    console.error('Error deleting user data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


////////////////////////////////
////////add users////////////////
//////////////////////////////////
app.post('/addusers', async (req, res) => {
  const userData = req.body;
  const db = client.db('admintable');
  const collection = db.collection('usersdetails');

  try {
    await collection.insertOne(userData);
    res.status(200).json({ message: 'User data saved successfully' });
  } catch (err) {
    console.error('Error saving user data:', err);
    res.status(500).json({ message: 'Failed to save user data' });
  }
});

app.get('/getusers', async (req, res) => {
  const db = client.db('admintable');
  const collection = db.collection('usersdetails');

  try {
    const users = await collection.find().toArray();
    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.get('/getuserdetails', async (req, res) => {
  const { email, phoneNumber } = req.query;

  if (!email && !phoneNumber) {
    return res.status(400).json({ message: 'Please provide either email or phoneNumber in the query parameters.' });
  }

  const db = client.db('admintable');
  const collection = db.collection('usersdetails');

  try {
    let query = {};

    if (email) {
      query = { email };
    } else if (phoneNumber) {
      query = { phoneNumber };
    }

    const userDetails = await collection.findOne(query);

    if (!userDetails) {
      return res.status(404).json({ message: 'User not found with the specified criteria.' });
    }

    res.status(200).json(userDetails);
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.status(500).json({ message: 'Failed to fetch user details.' });
  }
});



///////////////////////////
////////users table////////
///////////////////////////
app.patch('/modify/users/modifyRole', async (req, res) => {
  try {
    const { email, newRole, database, collection } = req.body;
    const db = client.db('admintable');
    const usersCollection = db.collection('usersdetails');

    // Find the user by email and update the role
    const user = await usersCollection.findOneAndUpdate({ email }, { $set: { role: newRole } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// API endpoint for fetching users based on role
app.get('/modify/users', async (req, res) => {
  try {
    const { role, database, collection } = req.query;
    const db = client.db('admintable');
    const usersCollection = db.collection('usersdetails');

    const filter = role ? { role } : {};

    const users = await usersCollection.find(filter).toArray();
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


//////////////////////////////////////////
////////////accesssettings///////////////
////////////////////////////////////////


app.post('/api/people', async (req, res) => {
  try {
    const newPerson = new Person(req.body);
    const savedPerson = await newPerson.save();
    res.json(savedPerson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/people', async (req, res) => {
  try {
    const people = await Person.find();
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/assign/:personId/:assignedToId', async (req, res) => {
  try {
    const { personId, assignedToId } = req.params;
    const updatedPerson = await Person.findByIdAndUpdate(personId, { assignedTo: assignedToId }, { new: true });

    if (!updatedPerson) {
      return res.status(404).json({ error: 'Person not found' });
    }

    res.json(updatedPerson);
  } catch (error) {
    console.error('Error assigning person:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/person/:personId', async (req, res) => {
  try {
    const personId = req.params.personId;
    const person = await Person.findById(personId);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const assignedPeopleCount = await Person.countDocuments({ assignedTo: personId });

    res.json({
      ...person.toObject(),
      assignedPeopleCount,
    });
  } catch (error) {
    console.error('Error fetching person details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/assigned-people/:assignedPersonId', async (req, res) => {
  try {
    const assignedPersonId = req.params.assignedPersonId;
    const assignedPeople = await Person.find({ assignedTo: assignedPersonId });
    res.json(assignedPeople);
  } catch (error) {
    console.error('Error fetching assigned people details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/people/:personId', async (req, res) => {
  try {
    const personId = req.params.personId;
    await Person.findByIdAndDelete(personId);
    res.status(204).end(); 
  } catch (error) {
    console.error('Error deleting person:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const person = await Person.findOne({ username });

    if (!person || !bcrypt.compareSync(password, person.password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      _id: person._id,
      username: person.username,
      email: person.email,
      phoneNumber: person.phoneNumber,
      role: person.role,
    });
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

///////////////////////////////
///////////firebase-users///////////////////
///////////////////////////////////



app.post('/firebase', async (req, res) => {
    try {
        const { email, uid, role } = req.body; // Ensure correct extraction of user data

        // Save user data to MongoDB Atlas
        await saveToMongoDB({ email, uid, role });

        res.status(200).json({ message: 'User data saved successfully' });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function saveToMongoDB(userData) {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        const database = client.db('admintable');
        const collection = database.collection('firebase-users');

        // Insert user data into MongoDB
        await collection.insertOne(userData);
    } finally {
        await client.close();
    }
}

//////////////////////////////////////
/////////carrier details///////////////////
////////////////////////////////////////

app.post('/carrierdetails', async (req, res) => {
  try {
      const { name, location } = req.body;

      const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();

      const database = client.db('admintable');
      const result = await database.collection('carrier-details').insertOne({
          _id: new ObjectId(),
          name,
          location,
      });

      await client.close();

      res.status(200).json({ message: 'Carrier details saved successfully', carrierId: result.insertedId });
  } catch (error) {
      console.error('Error saving carrier details:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/clientdetails', async (req, res) => {
  try {
      const { name, location, contact, comment,client_id } = req.body;

      const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();

      const database = client.db('admintable');
      const result = await database.collection('client-details').insertOne({
          _id: new ObjectId(),
          name,
          location,
          contact,
          comment,
          client_id,
      });

      await client.close();

      res.status(200).json({ message: 'Client details saved successfully', clientId: result.insertedId });
  } catch (error) {
      console.error('Error saving client details:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


/////////////////////////////////////
//////////////////cc mapping /////////
/////////////////////////////////////
app.get('/api/getClients', async (req, res) => {
  try {
    const db = client.db('admintable');
    const collection = db.collection('client-details');
    const clients = await collection.find().toArray();
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/getCarriers', async (req, res) => {
  try {
    const db = client.db('admintable');
    const collection = db.collection('carrier-details');
    const carriers = await collection.find().toArray();
    res.json(carriers);
  } catch (error) {
    console.error('Error fetching carriers:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


const clientcarrierMapping = mongoose.model('clientcarrierMapping', {
  client: String,
  client_id: String,
  carrier: String,
  carrier_id: String,
});


app.post('/api/saveClientMapping1', async (req, res) => {
  const { client, client_id, carrier, carrier_id } = req.body;

  try {
    const mapping = new clientcarrierMapping({

      client_id,
   
      carrier_id,
    });

    await mapping.save();
    
    res.status(200).json({ success: true, message: 'Mapping data saved successfully' });
  } catch (error) {
    console.error('Error saving mapping data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


/////////////////////////////////
////////fetching mails //////
//////////////////////////////////
app.get('/api/getEmails', async (req, res) => {
  try {
    const db = client.db('admintable');
    const collection = db.collection('firebase-users');
    const emails = await collection.find().toArray();
    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



const userclientMapping2 = mongoose.model('userclientMapping', {
  client: String,
  client_id: String,
  email: String,
  email_uid: String,
});

app.post('/api/saveClientMapping2', async (req, res) => {
  const { client, client_id, email, email_uid} = req.body;

  try {
    const mapping = new userclientMapping2({

      client_id,
   
      email_uid,
    });

    await mapping.save();
    
    res.status(200).json({ success: true, message: 'Mapping data saved successfully' });
  } catch (error) {
    console.error('Error saving mapping data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

////////////////////////////
///////////fetching ///////////
/////////////////////////////////

app.get('/api/getUids', async (req, res) => {
  try {
    const db = client.db('admintable'); // Replace with your actual database name
    const collection = db.collection('userclientmappings'); // Replace with your actual collection name
    const uids = await collection.find({}, { projection: { _id: 0, email_uid: 1 } }).toArray();
    res.json(uids.map(({ email_uid }) => email_uid));
  } catch (error) {
    console.error('Error fetching UIDs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/getDataByEmailUid', async (req, res) => {
  const { email_uid } = req.query;

  try {
    const db = mongoose.connection.useDb('admintable');
    const collection = db.collection('userclientmappings');

    const data = await collection.find({ email_uid }).toArray();
    res.json(data);
  } catch (error) {
    console.error('Error fetching data by email_uid:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/api/getClientIds', async (req, res) => {
  try {
    const db = mongoose.connection.useDb('admintable');
    const collection = db.collection('clientcarriermappings');

    const clientIds = await collection.distinct('client_id');
    res.json(clientIds);
  } catch (error) {
    console.error('Error fetching Client IDs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// New route to fetch data by client_id
app.get('/api/getDataByClientId', async (req, res) => {
  const { client_id } = req.query;

  try {
    const db = mongoose.connection.useDb('admintable');
    const collection = db.collection('clientcarriermappings');

    const data = await collection.find({ client_id }).toArray();
    res.json(data);
  } catch (error) {
    console.error('Error fetching data by client_id:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//////////////////////////////////////////
////////////////profile//////////////////////
///////////////////////////////////////////
app.get('/api/getProfileData', async (req, res) => {
  const { email } = req.query;

  try {
    // Use the specified database and collection for profile data
    const db = mongoose.connection.useDb('admintable');
    const collection = db.collection('firebase-users');

    // Fetch profile data based on the decrypted email
    const profileData = await collection.findOne({ email });

    if (!profileData) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profileData);
  } catch (error) {
    console.error('Error fetching profile data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});





app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  connectDB();
});
