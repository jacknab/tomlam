import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const fromNumber = process.env.TWILIO_PHONE_NUMBER || null;

// Create Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    supabase: !!supabase,
    twilio: !!twilioClient
  });
});

// API routes
app.post('/api/scheduleSms', async (req, res) => {
  try {
    const { phoneNumber, immediate, points, storeid } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Format phone number to E.164 format
    const formattedPhone = phoneNumber.startsWith('+1') 
      ? phoneNumber 
      : `+1${phoneNumber.replace(/\D/g, '')}`;

    if (immediate && twilioClient && fromNumber) {
      try {
        const { data: storeData, error: storeError } = await supabase 
          .from('store')
          .select('review_sms, promo_trigger, promo_sms')
          .eq('store_number', Number(storeid))
          .maybeSingle();

        if (storeError) {
          console.error('Supabase error fetching store:', storeError);
          return res.status(500).json({ error: 'Failed to fetch store message' });
        }

        if (storeData.promo_trigger) {
          const { data: customerData, error: customerError } = await supabase
            .from('check_ins')
            .select('points')
            .eq('phone_number', formattedPhone)
            .maybeSingle();

          if (customerError) {
            console.error('Failed to fetch customer points:', customerError);
          } else if (customerData?.points === storeData.promo_trigger && storeData.promo_sms) {
            const { error: resetError } = await supabase
              .from('check_ins')
              .update({ points: 0 })
              .eq('phone_number', formattedPhone);

            if (resetError) {
              console.error('Failed to reset points:', resetError);
            }

            try {
              await twilioClient.messages.create({
                body: storeData.promo_sms,
                from: fromNumber,
                to: formattedPhone
              });

              const { error: updateError } = await supabase
                .from('store')
                .update({ sms_count: supabase.sql`sms_count + 1` })
                .eq('store_number', Number(storeid));

              if (updateError) {
                console.error('Failed to update SMS count for promo:', updateError);
              }
            } catch (error) {
              console.error('Failed to send promo SMS:', error);
            }
          }
        }

        const messageBody = storeData?.review_sms || 
          'Thank you for visiting! Please leave us a review.';

        try {
          const message = await twilioClient.messages.create({
            body: messageBody,
            from: fromNumber,
            to: formattedPhone
          });

          const { error: updateError } = await supabase
            .from('store')
            .update({ sms_count: supabase.sql`sms_count + 1` })
            .eq('store_number', Number(storeid));

          if (updateError) {
            console.error('Failed to update SMS count:', updateError);
          }

          return res.json({ 
            success: true, 
            messageId: message.sid,
            message: 'SMS sent successfully'
          });
        } catch (error) {
          console.error('Twilio error:', error);
          return res.status(500).json({ 
            error: `Failed to send SMS: ${error.message || 'Unknown error'}` 
          });
        }
      } catch (error) {
        console.error('Failed to process SMS:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'SMS scheduled successfully'
      });
    }
  } catch (error) {
    console.error('Error scheduling SMS:', error);
    res.status(500).json({ error: 'Failed to schedule SMS' });
  }
});

// Process scheduled SMS messages
const processScheduledSms = async (supabaseClient, twilioClientInstance, fromNum) => {
  try {
    const { data: smsRecords, error: fetchError } = await supabaseClient
      .from('scheduled_sms')
      .select('*')
      .eq('status', 'pending')
      .limit(10); // Limit how many to process at once

    if (fetchError) {
      console.error('Error fetching scheduled SMS:', fetchError);
      return { success: false, error: fetchError };
    }

    for (const sms of smsRecords) {
      try {
        if (!sms.body) {
          console.error(`Skipping SMS ${sms.id} - no message body`);
          // Update status to sent to avoid retry loops
          await supabaseClient
            .from('scheduled_sms')
            .update({ status: 'sent' })
            .eq('id', sms.id);
          continue;
        }

        await twilioClientInstance.messages.create({
          body: sms.body,
          from: fromNum,
          to: sms.phone_number,
        });

        console.log(`Sent SMS to ${sms.phone_number}, ID: ${sms.id}`);

      } catch (sendError) {
        console.error(`Failed to send SMS to ${sms.phone_number}:`, sendError);
      } finally {
        // Update status to 'sent' regardless of success or failure
        await supabaseClient
          .from('scheduled_sms')
          .update({ status: 'sent' })
          .eq('id', sms.id);

        console.log(`Marked SMS ${sms.id} as sent (status updated after sending attempt)`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error in processScheduledSms:', error);
    return { success: false, error };
  }
};

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: ${process.env.VITE_API_URL || 'Not configured'}`);
  console.log(`Twilio configured: ${!!twilioClient}`);

  // Run SMS processor once at startup
  processScheduledSms(supabase, twilioClient, fromNumber);

  // Schedule to run every minute
  setInterval(() => {
    processScheduledSms(supabase, twilioClient, fromNumber);
  }, 60000);
});
